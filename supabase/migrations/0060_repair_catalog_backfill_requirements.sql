-- Repair catalog backfill requirements and recover failed INVALID_MATCH evaluations.
begin;

-- 1. Ensure backfill_profile_catalog inserts requirements for newly backfilled items.
create or replace function opportunityos_private.backfill_profile_catalog(p_user uuid)
returns int language plpgsql security definer set search_path='' as $$
declare
  p public.profiles%rowtype;
  c record;
  v_raw uuid;
  v_opp uuid;
  inserted int := 0;
  fp text;
  v_skills text[];
  req jsonb;
begin
  select * into p from public.profiles where user_id = p_user;
  if not found then return 0; end if;

  select coalesce(array_agg(s.canonical_name), '{}'::text[]) into v_skills
  from public.profile_skills ps
  join public.skills s on s.id = ps.skill_id
  where ps.user_id = p_user;

  for c in
    select cat.*, coalesce(reg.source_badge, reg.name) as badge
    from opportunityos_private.catalog_opportunities cat
    join opportunityos_private.source_registry reg on reg.id = cat.source_id
    where reg.status = 'active'
      and reg.superseded_by is null
      and (cardinality(p.interest_types) = 0 or cat.type = any(p.interest_types))
      and (cat.deadline is null or cat.deadline >= current_date)
      and (cat.seniority_level is null or cat.seniority_level not in ('senior', 'executive'))
      and (
        cat.type = 'hackathon'
        or coalesce(cat.location, '') !~* '(london|san francisco|seattle|austin|dublin|ireland|germany|berlin|france|paris|united kingdom|united states|usa|canada|toronto|vancouver|australia|sydney|singapore|tokyo|japan)'
        or coalesce(cat.location, '') ~* '(india|bengaluru|bangalore|hyderabad|pune|mumbai|delhi|noida|gurugram|chennai|kolkata|remote|worldwide)'
      )
      and not exists (
        select 1 from public.user_source_preferences sp
        where sp.user_id = p_user
          and sp.source_identifier = lower(cat.organization)
          and sp.preference = 'muted'
      )
      and public.profile_domain_matches(
        cat.title,
        cat.type,
        case when jsonb_typeof(cat.structured_fields->'skills') = 'array'
             then array(select jsonb_array_elements_text(cat.structured_fields->'skills'))
             else '{}'::text[] end,
        p.branch,
        v_skills
      )
      and not exists (
        select 1 from public.opportunities o
        where o.user_id = p_user and o.catalog_id = cat.id
      )
    order by case when cat.type = 'internship' then 0 when cat.type = 'hackathon' then 1 else 2 end,
             cat.updated_at desc, cat.id
    limit 100
  loop
    fp := encode(extensions.digest(concat(p_user::text, ':catalog:', c.stable_key)::bytea, 'sha256'), 'hex');

    insert into public.raw_items(user_id, request_id, source_type, raw_content, status, is_opportunity, content_hash)
    values (
      p_user,
      gen_random_uuid(),
      'discovery',
      left(concat('DISCOVERED: ', c.title, ' from ', c.badge, E'\n', c.raw_text), 20000),
      'understood',
      true,
      c.content_hash
    )
    on conflict (user_id, content_hash) where content_hash is not null
    do update set updated_at = now()
    returning id into v_raw;

    insert into public.opportunities(
      user_id, fingerprint, title, organization, deadline, location, type, application_url, description,
      skills, ambiguity_flags, extracted_json, extraction_confidence, extraction_version, trust_tier,
      source_badge, catalog_id, risk_signals, seniority_level
    ) values (
      p_user, fp, c.title, c.organization, c.deadline, c.location, c.type, c.application_url, c.raw_text,
      case when jsonb_typeof(c.structured_fields->'skills') = 'array'
           then array(select jsonb_array_elements_text(c.structured_fields->'skills'))
           else '{}'::text[] end,
      '{}'::text[],
      jsonb_build_object('content_hash', c.content_hash, 'fields', c.structured_fields, 'field_provenance', c.field_provenance),
      0.85, 'discovery-v2', c.trust_tier, c.badge, c.id, c.risk_signals, c.seniority_level
    )
    on conflict (user_id, fingerprint) do nothing
    returning id into v_opp;

    if v_opp is null then continue; end if;

    insert into public.opportunity_sources(user_id, opportunity_id, raw_item_id, extracted_json)
    values (
      p_user, v_opp, v_raw,
      jsonb_build_object('content_hash', c.content_hash, 'fields', c.structured_fields, 'field_provenance', c.field_provenance)
    )
    on conflict do nothing;

    -- Extract and persist requirements for the backfilled opportunity
    delete from public.opportunity_requirements where opportunity_id = v_opp and user_id = p_user;
    for req in select value from jsonb_array_elements(coalesce(c.structured_fields->'requirements', '[]'::jsonb)) loop
      if length(coalesce(req->>'evidence', '')) > 0 and position(req->>'evidence' in coalesce(c.raw_text, '')) > 0 then
        insert into public.opportunity_requirements(user_id, opportunity_id, kind, value, mandatory, evidence_snippet)
        values (
          p_user, v_opp,
          req->>'kind',
          req->>'value',
          coalesce((req->>'mandatory')::boolean, false),
          req->>'evidence'
        );
      end if;
    end loop;

    perform public.enqueue_evaluation(p_user, v_opp);
    inserted := inserted + 1;
  end loop;

  return inserted;
end $$;

revoke all on function opportunityos_private.backfill_profile_catalog(uuid) from public, anon, authenticated;

-- 2. Retroactively insert missing requirements for all existing catalog opportunities
insert into public.opportunity_requirements(user_id, opportunity_id, kind, value, mandatory, evidence_snippet)
select
  o.user_id,
  o.id,
  req->>'kind',
  req->>'value',
  coalesce((req->>'mandatory')::boolean, false),
  req->>'evidence'
from public.opportunities o
join opportunityos_private.catalog_opportunities cat on cat.id = o.catalog_id
cross join lateral jsonb_array_elements(coalesce(cat.structured_fields->'requirements', '[]'::jsonb)) req
where length(coalesce(req->>'evidence', '')) > 0
  and position(req->>'evidence' in coalesce(cat.raw_text, '')) > 0
  and not exists (
    select 1 from public.opportunity_requirements r
    where r.user_id = o.user_id
      and r.opportunity_id = o.id
      and r.kind = req->>'kind'
      and r.value = req->>'value'
  );

-- 3. Clear failed match_cache entries poisoned by INVALID_MATCH so cache lookup returns 'new'
delete from public.match_cache
where error_code = 'INVALID_MATCH';

-- 4. Reset failed matches caused by INVALID_MATCH to queued for clean re-evaluation
update public.matches
set status = 'queued',
    decision = null,
    error_code = null,
    claim_token = null,
    claimed_until = null,
    next_attempt_at = now(),
    revision = revision + 1,
    updated_at = now()
where status = 'failed' and error_code = 'INVALID_MATCH';

-- 5. Re-enqueue evaluation for any catalog opportunities that currently have no match record
insert into public.matches(user_id, opportunity_id, status, next_attempt_at)
select o.user_id, o.id, 'queued', now()
from public.opportunities o
where o.catalog_id is not null
  and not exists (
    select 1 from public.matches m
    where m.user_id = o.user_id and m.opportunity_id = o.id
  )
on conflict do nothing;

commit;
