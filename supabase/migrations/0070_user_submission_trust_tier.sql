-- Migration 0070: User Submission Trust Tier
-- Direct user submissions (Gmail forwarding, bookmarklet capture, URL paste, text paste)
-- are explicitly authorized by the user. They must not be treated as unverified or blocked.

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
  v_trust_tier text;
  v_source_badge text;
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

    -- User submissions are directly authorized by the user; default to attributed (never unverified)
    v_trust_tier := coalesce(item->>'trust_tier', case when r.source_type in ('email', 'capture', 'url', 'text') then 'attributed' else 'attributed' end);
    v_source_badge := coalesce(item->>'source_badge', case
      when r.source_type = 'email' then 'Forwarded email'
      when r.source_type = 'capture' then 'Captured page'
      when r.source_type = 'url' then 'Website link'
      when r.source_type = 'text' then 'Pasted announcement'
      else 'User submission'
    end);

    insert into public.opportunities(
      user_id, fingerprint, title, organization, deadline, location, type, application_url, description,
      skills, ambiguity_flags, extracted_json, extraction_confidence, extraction_version, requirements_status,
      trust_tier, source_badge
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
      v_req_status,
      v_trust_tier,
      v_source_badge
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
      set ambiguity_flags = array(select distinct x from unnest(ambiguity_flags || array(select jsonb_array_elements_text(item->'ambiguity_flags'))) x),
          trust_tier = case when trust_tier = 'unverified' and r.source_type in ('email', 'capture', 'url', 'text') then 'attributed' else trust_tier end,
          source_badge = coalesce(source_badge, v_source_badge)
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

-- Retroactively upgrade user-submitted opportunities from unverified to attributed
update public.opportunities o
set trust_tier = 'attributed'
where o.trust_tier = 'unverified'
  and exists (
    select 1 from public.opportunity_sources os
    join public.raw_items r on r.id = os.raw_item_id
    where os.opportunity_id = o.id and r.source_type in ('email', 'capture', 'url', 'text')
  );
