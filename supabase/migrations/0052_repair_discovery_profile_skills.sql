-- Restore the discovery projection against the actual profile schema.
begin;
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
  v_projection_hash text;
begin
  -- Validate Claimed Run Lease
  select r.*, s.trust_tier as reg_trust_tier, coalesce(s.source_badge, s.name) as reg_source_badge
  into v_run
  from opportunityos_private.discovery_runs r
  join opportunityos_private.source_registry s on s.id = r.source_id
  where r.id = p_run_id and r.status = 'running' and r.claimed_until > now()
  for update;

  if not found then
    return jsonb_build_object('saved', false, 'error', 'INVALID_OR_EXPIRED_DISCOVERY_RUN');
  end if;

  if p_lease_token is null or v_run.lease_token is distinct from p_lease_token then
    return jsonb_build_object('saved', false, 'error', 'LEASE_TOKEN_MISMATCH');
  end if;

  if p_item->>'title' is null or p_item->>'original_url' is null or p_item->>'external_id' is null then
    return jsonb_build_object('saved', false, 'error', 'Missing required item fields');
  end if;

  v_title := p_item->>'title';
  v_type := p_item->>'type';
  -- Scope guard: strictly job, internship, or hackathon
  if v_type not in ('job', 'internship', 'hackathon') then
    return jsonb_build_object('saved', false, 'ignored_reason', 'out_of_scope_type');
  end if;

  -- Classify seniority
  v_seniority := public.classify_seniority(v_title, coalesce(p_item->'fields'->>'commitment', ''));

  -- Trust tier derived STRICTLY from registry, never from caller payload
  v_trust_tier := v_run.reg_trust_tier;
  v_source_badge := v_run.reg_source_badge;
  v_risk_signals := array(select jsonb_array_elements_text(coalesce(p_item->'risk_signals', '[]'::jsonb)));

  if array_length(v_risk_signals, 1) > 0 then
    v_trust_tier := 'unverified';
  end if;

  -- Parse deadline safely
  v_deadline := case 
    when p_item->>'deadline' is not null and p_item->>'deadline' ~ '^\d{4}-\d{2}-\d{2}$' 
    then (p_item->>'deadline')::date 
    else null 
  end;

  v_content_hash := coalesce(
    p_item->>'content_hash', 
    encode(extensions.digest(concat(v_title, ':', coalesce(p_item->>'location', ''), ':', coalesce(p_item->>'raw_text', ''))::bytea, 'sha256'), 'hex')
  );

  -- Check existing catalog entry for deduplicating rescans
  select id, content_hash into v_existing_id, v_existing_hash
  from opportunityos_private.catalog_opportunities
  where stable_key = concat(v_run.adapter, ':', p_item->>'external_id');

  -- Canonical stable key includes adapter and external id
  insert into opportunityos_private.catalog_opportunities(
    stable_key, source_id, adapter, external_id, title, organization, type, location, deadline,
    application_url, original_url, trust_tier, risk_signals, content_hash, raw_text,
    structured_fields, field_provenance, seniority_level
  ) values (
    concat(v_run.adapter, ':', p_item->>'external_id'),
    v_run.source_id,
    v_run.adapter,
    p_item->>'external_id',
    v_title,
    p_item->>'organization',
    v_type,
    p_item->>'location',
    v_deadline,
    p_item->>'application_url',
    p_item->>'original_url',
    v_trust_tier,
    v_risk_signals,
    v_content_hash,
    coalesce(p_item->>'raw_text', v_title),
    coalesce(p_item->'fields', '{}'::jsonb),
    coalesce(p_item->'field_provenance', '[]'::jsonb),
    v_seniority
  ) on conflict (stable_key) do update set
    title = excluded.title,
    organization = excluded.organization,
    type = excluded.type,
    location = excluded.location,
    deadline = excluded.deadline,
    application_url = excluded.application_url,
    trust_tier = excluded.trust_tier,
    risk_signals = excluded.risk_signals,
    raw_text = excluded.raw_text,
    content_hash = excluded.content_hash,
    structured_fields = excluded.structured_fields,
    seniority_level = excluded.seniority_level,
    updated_at = now()
  returning id into v_cat_id;

  -- Project to users with relevance, field matching, and mute filtering
  for u in 
    select p.user_id, p.interest_types, p.career_goals, p.branch, (select coalesce(array_agg(s.canonical_name),'{}'::text[]) from public.profile_skills ps join public.skills s on s.id=ps.skill_id where ps.user_id=p.user_id) as skills
    from public.profiles p
    where p.interest_types is null 
       or cardinality(p.interest_types) = 0 
       or v_type = any(p.interest_types)
  loop
    -- Check user source preference (e.g. muted sources)
    select preference into v_user_pref
    from public.user_source_preferences
    where user_id = u.user_id and source_identifier = lower(coalesce(p_item->>'organization', ''));

    if v_user_pref = 'muted' then
      continue; -- Skip projection for muted sources
    end if;

    -- The India demo accepts India and remote listings; reject explicit foreign-only locations.
    if v_type<>'hackathon' and coalesce(p_item->>'location','') ~* '(london|san francisco|seattle|austin|dublin|ireland|germany|berlin|france|paris|united kingdom|united states|usa|canada|toronto|vancouver|australia|sydney|singapore|tokyo|japan)'
       and coalesce(p_item->>'location','') !~* '(india|bengaluru|bangalore|hyderabad|pune|mumbai|delhi|noida|gurugram|chennai|kolkata|remote|worldwide)' then continue; end if;
    if not public.profile_domain_matches(v_title,v_type,array(select jsonb_array_elements_text(coalesce(p_item->'skills','[]'::jsonb))),u.branch,u.skills) then continue; end if;

    -- Seniority relevance check for student profiles
    v_is_intern_seeker := (u.interest_types is null or cardinality(u.interest_types) = 0 or 'internship' = any(u.interest_types));
    if v_is_intern_seeker and v_seniority in ('senior', 'executive') then
      if not (coalesce(u.career_goals, '') ~* 'senior|lead|manager|director') then
        continue;
      end if;
    end if;

    -- Composite fingerprint includes user, adapter, external_id, and location
    v_fp := encode(extensions.digest(concat(u.user_id::text, ':', v_run.adapter, ':', p_item->>'external_id', ':', coalesce(p_item->>'location', ''))::bytea, 'sha256'), 'hex');

    select extracted_json->>'content_hash' into v_projection_hash from public.opportunities where user_id=u.user_id and fingerprint=v_fp;
    if found and v_projection_hash=v_content_hash then continue; end if;
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

    -- Insert opportunity projection
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
      title = excluded.title,
      skills = excluded.skills,
      extracted_json = excluded.extracted_json,
      deadline = excluded.deadline,
      trust_tier = excluded.trust_tier,
      risk_signals = excluded.risk_signals,
      description = excluded.description,
      seniority_level = excluded.seniority_level,
      updated_at = now()
    returning id into v_opp_id;

    if v_opp_id is not null and v_raw_id is not null then
      insert into public.opportunity_sources(user_id, opportunity_id, raw_item_id, extracted_json)
      values (u.user_id, v_opp_id, v_raw_id, p_item)
      on conflict do nothing;

      delete from public.opportunity_requirements where opportunity_id=v_opp_id and user_id=u.user_id;
      for req in select value from jsonb_array_elements(coalesce(p_item->'requirements','[]'::jsonb)) loop
        if length(coalesce(req->>'evidence',''))>0 and position(req->>'evidence' in coalesce(p_item->>'raw_text',''))>0 then
          insert into public.opportunity_requirements(user_id,opportunity_id,kind,value,mandatory,evidence_snippet)
          values(u.user_id,v_opp_id,req->>'kind',req->>'value',coalesce((req->>'mandatory')::boolean,false),req->>'evidence');
        end if;
      end loop;
      perform public.enqueue_evaluation(u.user_id, v_opp_id);
      v_was_created := true;
    end if;
  end loop;

  return jsonb_build_object('saved', true, 'catalog_id', v_cat_id, 'was_created', v_existing_id is null, 'was_updated', v_existing_id is not null and v_existing_hash is distinct from v_content_hash);
end; $$;



revoke all on function public.worker_save_discovery_item(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.worker_save_discovery_item(uuid,jsonb,uuid) to service_role;
commit;
