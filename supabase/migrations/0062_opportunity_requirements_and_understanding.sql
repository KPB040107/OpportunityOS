-- 0062_opportunity_requirements_and_understanding.sql
-- Implements Phase 1 schema & backfill repairs:
-- 1. requirement_class ('mandatory_eligibility', 'required_skill', 'preferred_skill', 'other_requirement', 'benefit')
-- 2. requirements_status ('NO_REQUIREMENTS_STATED', 'EXTRACTION_INCOMPLETE', 'REQUIREMENTS_PRESENT')
-- 3. Case-insensitive evidence matching & fallback skill requirement generation
-- 4. Automatic repair for existing empty-requirement opportunities with stated skills

begin;

-- 1. Schema extensions
alter table public.opportunity_requirements
  add column if not exists requirement_class text check (requirement_class in ('mandatory_eligibility', 'required_skill', 'preferred_skill', 'other_requirement', 'benefit')) default 'mandatory_eligibility',
  add column if not exists quote text,
  add column if not exists status text check (status in ('active', 'clarified', 'archived')) default 'active';

alter table public.opportunities
  add column if not exists requirements_status text check (requirements_status in ('NO_REQUIREMENTS_STATED', 'EXTRACTION_INCOMPLETE', 'REQUIREMENTS_PRESENT')) default 'REQUIREMENTS_PRESENT';

alter table opportunityos_private.catalog_opportunities
  add column if not exists requirements_status text check (requirements_status in ('NO_REQUIREMENTS_STATED', 'EXTRACTION_INCOMPLETE', 'REQUIREMENTS_PRESENT')) default 'REQUIREMENTS_PRESENT';

-- 2. Update finish_understand_item to handle requirement_class, quote, and requirements_status
create or replace function public.finish_understand_item(p_id uuid, p_token uuid, p_result jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare
  r public.raw_items%rowtype;
  item jsonb;
  req jsonb;
  v_opp uuid;
  ids jsonb := '[]';
  existing jsonb;
  v_req_status text;
  v_req_class text;
begin
  select * into r from public.raw_items
  where id = p_id and status = 'processing' and claim_token = p_token and claimed_until > now()
  for update;
  if not found then raise exception 'Stale claim'; end if;

  if jsonb_typeof(p_result->'is_opportunity') <> 'boolean' or jsonb_typeof(p_result->'items') <> 'array' or jsonb_array_length(p_result->'items') > 5 then
    raise exception 'Invalid extraction';
  end if;

  for item in select value from jsonb_array_elements(p_result->'items') loop
    v_req_status := coalesce(item->>'requirements_status', 'REQUIREMENTS_PRESENT');
    if jsonb_array_length(coalesce(item->'requirements', '[]'::jsonb)) = 0 then
      if jsonb_array_length(coalesce(item->'skills', '[]'::jsonb)) = 0 then
        v_req_status := 'NO_REQUIREMENTS_STATED';
      end if;
    end if;

    insert into public.opportunities(
      user_id, fingerprint, title, organization, deadline, location, type, application_url, description,
      skills, ambiguity_flags, extracted_json, extraction_confidence, extraction_version, requirements_status
    ) values (
      r.user_id,
      item->>'fingerprint',
      item->>'title',
      item->>'organization',
      nullif(item->>'deadline', '')::date,
      item->>'location',
      item->>'type',
      item->>'application_url',
      item->>'description',
      array(select jsonb_array_elements_text(item->'skills')),
      array(select jsonb_array_elements_text(item->'ambiguity_flags')),
      item,
      (item->>'confidence')::numeric,
      p_result->>'extraction_version',
      v_req_status
    )
    on conflict (user_id, fingerprint) do nothing returning id into v_opp;

    if v_opp is null then
      select id, extracted_json into v_opp, existing from public.opportunities
      where user_id = r.user_id and fingerprint = item->>'fingerprint';

      if public.opportunity_material(existing) <> public.opportunity_material(item) then
        update public.opportunities
        set ambiguity_flags = array(select distinct x from unnest(ambiguity_flags || array(select jsonb_array_elements_text(item->'ambiguity_flags')) || array['source_variation']) x),
            updated_at = now()
        where user_id = r.user_id and id = v_opp;
      end if;

      update public.opportunities
      set ambiguity_flags = array(select distinct x from unnest(ambiguity_flags || array(select jsonb_array_elements_text(item->'ambiguity_flags'))) x)
      where id = v_opp and user_id = r.user_id;
    else
      for req in select value from jsonb_array_elements(coalesce(item->'requirements', '[]'::jsonb)) loop
        v_req_class := coalesce(req->>'requirement_class', case when (req->>'mandatory')::boolean then 'mandatory_eligibility' else 'preferred_skill' end);
        insert into public.opportunity_requirements(
          user_id, opportunity_id, kind, value, normalized_value, mandatory, evidence_snippet, requirement_class, quote
        ) values (
          r.user_id, v_opp, req->>'kind', req->>'value', req->'normalized_value',
          coalesce((req->>'mandatory')::boolean, false),
          req->>'evidence',
          v_req_class,
          coalesce(req->>'quote', req->>'evidence')
        );
      end loop;
    end if;

    insert into public.opportunity_sources(user_id, opportunity_id, raw_item_id, extracted_json)
    values (r.user_id, v_opp, r.id, item)
    on conflict do nothing;

    ids := ids || jsonb_build_array(v_opp);
    v_opp := null;
  end loop;

  update public.extraction_cache
  set status = 'complete', result_json = p_result, error_code = null, updated_at = now()
  where user_id = r.user_id
    and content_hash = coalesce(r.content_hash, (select content_hash from public.raw_items where id = r.duplicate_of))
    and version = 'extract-v1';

  update public.raw_items
  set status = 'understood', is_opportunity = (p_result->>'is_opportunity')::boolean,
      error_code = null, claim_token = null, claimed_until = null, updated_at = now()
  where id = r.id;

  update public.ai_extraction_budget
  set running_raw_id = null, running_until = null
  where running_raw_id = r.id;

  insert into public.events(user_id, stage, level, message, metadata)
  values (
    r.user_id, 'understand', 'info',
    case
      when r.duplicate_of is not null then 'Repeated content reused existing analysis'
      when (p_result->>'is_opportunity')::boolean then 'Opportunity details extracted'
      else 'Submission is not an opportunity'
    end,
    jsonb_build_object('raw_item_id', r.id, 'opportunity_ids', ids)
  );

  return jsonb_build_object('saved', true, 'opportunity_ids', ids);
end; $$;

-- 3. Update backfill_profile_catalog to populate requirement_class and create fallback skill requirements
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
  sk text;
  v_req_class text;
  v_req_count int;
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
      source_badge, catalog_id, risk_signals, seniority_level, requirements_status
    ) values (
      p_user, fp, c.title, c.organization, c.deadline, c.location, c.type, c.application_url, c.raw_text,
      case when jsonb_typeof(c.structured_fields->'skills') = 'array'
           then array(select jsonb_array_elements_text(c.structured_fields->'skills'))
           else '{}'::text[] end,
      '{}'::text[],
      jsonb_build_object('content_hash', c.content_hash, 'fields', c.structured_fields, 'field_provenance', c.field_provenance),
      0.85, 'discovery-v2', c.trust_tier, c.badge, c.id, c.risk_signals, c.seniority_level,
      coalesce(c.requirements_status, 'REQUIREMENTS_PRESENT')
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
    v_req_count := 0;

    for req in select value from jsonb_array_elements(coalesce(c.structured_fields->'requirements', '[]'::jsonb)) loop
      v_req_class := coalesce(req->>'requirement_class', case when (req->>'mandatory')::boolean then 'mandatory_eligibility' else 'preferred_skill' end);
      if length(coalesce(req->>'evidence', '')) > 0 and position(lower(req->>'evidence') in lower(coalesce(c.raw_text, ''))) > 0 then
        insert into public.opportunity_requirements(
          user_id, opportunity_id, kind, value, mandatory, evidence_snippet, requirement_class, quote
        ) values (
          p_user, v_opp,
          req->>'kind',
          req->>'value',
          coalesce((req->>'mandatory')::boolean, false),
          req->>'evidence',
          v_req_class,
          coalesce(req->>'quote', req->>'evidence')
        );
        v_req_count := v_req_count + 1;
      end if;
    end loop;

    -- Fallback: if requirements was empty but skills were extracted, create skill requirements
    if v_req_count = 0 and jsonb_typeof(c.structured_fields->'skills') = 'array' then
      for sk in select jsonb_array_elements_text(c.structured_fields->'skills') loop
        if length(sk) > 0 and position(lower(sk) in lower(coalesce(c.raw_text, ''))) > 0 then
          insert into public.opportunity_requirements(
            user_id, opportunity_id, kind, value, mandatory, evidence_snippet, requirement_class, quote
          ) values (
            p_user, v_opp,
            'skill',
            sk,
            false,
            sk,
            'required_skill',
            sk
          );
          v_req_count := v_req_count + 1;
        end if;
      end loop;
    end if;

    if v_req_count = 0 then
      update public.opportunities set requirements_status = 'NO_REQUIREMENTS_STATED' where id = v_opp;
    end if;

    perform public.enqueue_evaluation(p_user, v_opp);
    inserted := inserted + 1;
  end loop;

  return inserted;
end; $$;

-- 4. Immediate one-time data repair for existing opportunities with stated skills but 0 requirements
do $$
declare
  opp record;
  sk text;
  req_count int;
begin
  for opp in
    select o.id, o.user_id, o.skills, o.description
    from public.opportunities o
    where not exists (select 1 from public.opportunity_requirements r where r.opportunity_id = o.id)
      and cardinality(o.skills) > 0
  loop
    req_count := 0;
    foreach sk in array opp.skills loop
      if position(lower(sk) in lower(coalesce(opp.description, ''))) > 0 then
        insert into public.opportunity_requirements(
          user_id, opportunity_id, kind, value, mandatory, evidence_snippet, requirement_class, quote
        ) values (
          opp.user_id, opp.id,
          'skill',
          sk,
          false,
          sk,
          'required_skill',
          sk
        );
        req_count := req_count + 1;
      end if;
    end loop;

    if req_count > 0 then
      update public.opportunities set requirements_status = 'REQUIREMENTS_PRESENT' where id = opp.id;
      perform public.enqueue_evaluation(opp.user_id, opp.id);
    end if;
  end loop;
end $$;

commit;
