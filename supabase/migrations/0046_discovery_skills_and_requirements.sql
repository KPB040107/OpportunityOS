-- Migration 0046: Persist skills and requirements in discovery pipeline
-- Updates worker_save_discovery_item to store and update extracted skills and opportunity_requirements.

create or replace function public.worker_save_discovery_item(
  p_run_id uuid,
  p_item jsonb,
  p_lease_token uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_run record;
  v_cat_id uuid;
  v_existing_id uuid;
  v_existing_hash text;
  v_was_created boolean := false;
  u record;
  v_raw_id uuid;
  v_opp_id uuid;
  v_fp text;
  v_content_hash text;
  v_trust_tier text;
  v_source_badge text;
  v_risk_signals text[];
  v_deadline date;
  v_type text;
  v_seniority text;
  v_user_pref text;
  v_is_intern_seeker boolean;
  v_title text;
  req jsonb;
begin
  -- Validate worker lease
  select r.*, s.adapter, s.id as catalog_source_id
  into v_run
  from public.discovery_runs r
  join public.discovery_sources s on s.id = r.source_id
  where r.id = p_run_id
    and (p_lease_token is null or r.lease_token = p_lease_token);

  if not found then
    raise exception 'WORKER_LEASE_INVALID: Run % not found or lease token mismatch', p_run_id;
  end if;

  v_title := trim(coalesce(p_item->>'title', 'Untitled Opportunity'));
  v_type := coalesce(p_item->>'type', 'job');
  v_content_hash := p_item->>'content_hash';
  v_trust_tier := coalesce(p_item->>'trust_tier', 'corroborated');
  v_source_badge := coalesce(p_item->>'source_badge', 'Official');
  v_deadline := nullif(p_item->>'deadline', '')::date;
  v_seniority := coalesce(p_item->>'seniority_level', 'uncertain');

  v_risk_signals := array(
    select jsonb_array_elements_text(coalesce(p_item->'risk_signals', '[]'::jsonb))
  );

  -- 1. Deduplication & Global Catalog Insertion
  select id, content_hash into v_existing_id, v_existing_hash
  from public.discovery_catalog
  where adapter = v_run.adapter and external_id = (p_item->>'external_id');

  if v_existing_id is not null then
    v_cat_id := v_existing_id;
    if v_existing_hash is distinct from v_content_hash then
      update public.discovery_catalog
      set title = v_title,
          organization = p_item->>'organization',
          location = p_item->>'location',
          type = v_type,
          deadline = v_deadline,
          content_hash = v_content_hash,
          raw_text = p_item->>'raw_text',
          fields = coalesce(p_item->'fields', '{}'::jsonb),
          field_provenance = coalesce(p_item->'field_provenance', '[]'::jsonb),
          risk_signals = v_risk_signals,
          trust_tier = v_trust_tier,
          seniority_level = v_seniority,
          last_scanned_at = now(),
          times_observed = times_observed + 1,
          updated_at = now()
      where id = v_existing_id;
    else
      update public.discovery_catalog
      set last_scanned_at = now(),
          times_observed = times_observed + 1,
          updated_at = now()
      where id = v_existing_id;
    end if;
  else
    insert into public.discovery_catalog(
      source_id, adapter, external_id, title, organization, location,
      type, deadline, original_url, application_url, content_hash,
      raw_text, fields, field_provenance, risk_signals, trust_tier,
      seniority_level, first_seen_at, last_scanned_at
    ) values (
      v_run.catalog_source_id, v_run.adapter, p_item->>'external_id',
      v_title, p_item->>'organization', p_item->>'location',
      v_type, v_deadline, p_item->>'original_url', p_item->>'application_url',
      v_content_hash, p_item->>'raw_text', coalesce(p_item->'fields', '{}'::jsonb),
      coalesce(p_item->'field_provenance', '[]'::jsonb), v_risk_signals,
      v_trust_tier, v_seniority, now(), now()
    ) returning id into v_cat_id;
  end if;

  -- 2. Fan-out to relevant users
  for u in select user_id, branch, interest_types, career_goals from public.profiles loop
    -- Source mute preference check
    select preference into v_user_pref
    from public.user_source_preferences
    where user_id = u.user_id and source_identifier = lower(coalesce(p_item->>'organization', ''));

    if v_user_pref = 'muted' then
      continue;
    end if;

    -- Field & Domain relevance check:
    if v_type <> 'hackathon' and coalesce(u.branch, '') ~* 'computer|software|cse|cs|information technology|infotech|data science|data analytics|machine learning|ai & ds|ai and ds|ai' then
      if v_title ~* '\b(account executive|sales executive|sales manager|business development representative|bdr|sdr|inside sales|commercial hunter|commercial grower|telecaller|general counsel|legal counsel|privacy counsel|paralegal|attorney|lawyer|compliance manager|business finance|corporate finance|statutory audit|tax manager|financial controller|accounts payable|accounts receivable|performance marketing|growth marketing|brand marketing|seo specialist|social media manager|copywriter|human resources|recruiter|talent acquisition|hrbp|cluster head|last mile|warehouse manager|fleet manager|logistics coordinator|facilities manager|loss prevention|security & investigation|nurse|physician|chef)\b'
         and not (v_title ~* '\b(software|developer|sde|swe|engineer|engineering|data scientist|data science|data analyst|machine learning|deep learning|artificial intelligence|security|devops|cloud|qa|test)\b') then
        continue;
      end if;
    end if;

    -- Seniority relevance check for student profiles
    v_is_intern_seeker := (u.interest_types is null or cardinality(u.interest_types) = 0 or 'internship' = any(u.interest_types));
    if v_is_intern_seeker and v_seniority in ('senior', 'executive') then
      if not (coalesce(u.career_goals, '') ~* 'senior|lead|manager|director') then
        continue;
      end if;
    end if;

    -- Composite fingerprint includes user, adapter, external_id, and location
    v_fp := encode(extensions.digest(concat(u.user_id::text, ':', v_run.adapter, ':', p_item->>'external_id', ':', coalesce(p_item->>'location', ''))::bytea, 'sha256'), 'hex');

    -- Insert raw item projection
    insert into public.raw_items(
      user_id, request_id, source_type, raw_content, status, is_opportunity, content_hash
    ) values (
      u.user_id, gen_random_uuid(), 'discovery',
      concat('DISCOVERED: ', v_title, ' from ', v_source_badge, E'\n', coalesce(p_item->>'raw_text', '')),
      'understood', true, v_content_hash
    ) on conflict (user_id, content_hash) where content_hash is not null
    do update set updated_at = now()
    returning id into v_raw_id;

    -- Insert or update opportunity projection
    insert into public.opportunities(
      user_id, fingerprint, title, organization, deadline, location, type,
      application_url, description, skills, ambiguity_flags, extracted_json,
      extraction_confidence, extraction_version, trust_tier, source_badge, catalog_id, risk_signals,
      seniority_level
    ) values (
      u.user_id, v_fp, v_title, p_item->>'organization',
      v_deadline,
      p_item->>'location', v_type, p_item->>'application_url',
      p_item->>'raw_text',
      array(select jsonb_array_elements_text(coalesce(p_item->'skills', '[]'::jsonb))),
      v_risk_signals,
      p_item,
      0.85, 'discovery-v2', v_trust_tier, v_source_badge, v_cat_id, v_risk_signals,
      v_seniority
    ) on conflict (user_id, fingerprint) do update set
      deadline = excluded.deadline,
      trust_tier = excluded.trust_tier,
      risk_signals = excluded.risk_signals,
      description = excluded.description,
      skills = case when cardinality(excluded.skills) > 0 then excluded.skills else public.opportunities.skills end,
      extracted_json = excluded.extracted_json,
      seniority_level = excluded.seniority_level,
      updated_at = now()
    returning id into v_opp_id;

    if v_opp_id is not null then
      -- Populate opportunity_requirements if extracted
      if jsonb_typeof(p_item->'requirements') = 'array' and jsonb_array_length(p_item->'requirements') > 0 then
        delete from public.opportunity_requirements where user_id = u.user_id and opportunity_id = v_opp_id;
        for req in select value from jsonb_array_elements(p_item->'requirements') loop
          insert into public.opportunity_requirements(user_id, opportunity_id, kind, value, normalized_value, mandatory, evidence_snippet)
          values(u.user_id, v_opp_id, req->>'kind', req->>'value', req->'normalized_value', coalesce((req->>'mandatory')::boolean, false), req->>'evidence');
        end loop;
      end if;

      if v_raw_id is not null then
        insert into public.opportunity_sources(user_id, opportunity_id, raw_item_id, extracted_json)
        values (u.user_id, v_opp_id, v_raw_id, p_item)
        on conflict do nothing;

        perform public.enqueue_evaluation(u.user_id, v_opp_id);
        v_was_created := true;
      end if;
    end if;
  end loop;

  return jsonb_build_object('saved', true, 'catalog_id', v_cat_id, 'was_created', v_was_created);
end; $$;

revoke all on function public.worker_save_discovery_item(uuid, jsonb, uuid) from public, anon;
grant execute on function public.worker_save_discovery_item(uuid, jsonb, uuid) to service_role;
