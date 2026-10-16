-- Migration 0051: India Scope & Location Guard
-- Deactivates foreign company feeds and ensures non-India postings are guarded from student projection.
begin;

-- 1. Pause global non-India sources in private source registry
update opportunityos_private.source_registry
set status = 'paused', updated_at = now()
where (adapter = 'greenhouse-v1' and config->>'company' in ('stripe', 'cloudflare', 'databricks', 'figma', 'vercel'))
   or (adapter = 'ashby-v1' and config->>'company' in ('posthog'));

-- 2. Ensure India & Hackathon sources remain active
update opportunityos_private.source_registry
set status = 'active', updated_at = now()
where (adapter = 'lever-v1' and config->>'company' in ('meesho', 'cred'))
   or (adapter = 'jsearch-v1')
   or (adapter = 'devpost-v1' and config->>'url' = 'https://devpost.com/api/hackathons');

-- 3. Update worker_save_discovery_item with India location guard
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

  -- Project to users with relevance, field matching, location guard, and mute filtering
  for u in 
    select p.user_id, p.interest_types, p.career_goals, p.branch, p.skills
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

    -- Location guard: if strictly foreign location and not India/Remote, skip projection to India student
    if p_item->>'location' is not null and (
      p_item->>'location' ~* '\b(london|san francisco|sf|seattle|austin|dublin|ireland|germany|berlin|france|paris|united kingdom|uk|united states|usa|canada|toronto|vancouver|australia|sydney|singapore|tokyo|japan)\b'
    ) and not (
      p_item->>'location' ~* '\b(india|bengaluru|bangalore|hyderabad|pune|mumbai|delhi|noida|gurgaon|gurugram|chennai|kolkata|ahmedabad|karnataka|maharashtra|telangana|tamil\s*nadu|haryana)\b'
    ) then
      continue;
    end if;

    if not public.profile_domain_matches(v_title,v_type,array(select jsonb_array_elements_text(coalesce(p_item->'skills','[]'::jsonb))),u.branch,u.skills) then continue; end if;

    -- Seniority relevance check for student profiles
    v_is_intern_seeker := (u.interest_types is null or cardinality(u.interest_types) = 0 or 'internship' = any(u.interest_types));
    if v_is_intern_seeker and v_seniority in ('senior', 'executive') then
      continue; -- Skip senior roles for internship seekers
    end if;

    -- Deduplicate projection by fingerprint
    v_fp := encode(extensions.digest(concat(v_title, ':', coalesce(p_item->>'organization', ''), ':', coalesce(p_item->>'location', ''))::bytea, 'hex')::bytea, 'hex');

    -- Compute deterministic projection hash
    v_projection_hash := encode(extensions.digest(concat(u.user_id::text, ':', v_fp, ':', coalesce(p_item->>'raw_text', v_title))::bytea, 'sha256'), 'hex');

    -- Insert or update user opportunity projection
    insert into public.opportunities(
      user_id, title, organization, location, deadline, application_url, description,
      type, fingerprint, trust_tier, source_badge, catalog_id, risk_signals,
      seniority_level, skills, ambiguity_flags, extraction_confidence, extraction_version
    ) values (
      u.user_id,
      v_title,
      p_item->>'organization',
      p_item->>'location',
      v_deadline,
      p_item->>'application_url',
      coalesce(p_item->>'raw_text', v_title),
      v_type,
      v_fp,
      v_trust_tier,
      v_source_badge,
      v_cat_id,
      v_risk_signals,
      v_seniority,
      array(select jsonb_array_elements_text(coalesce(p_item->'skills', '[]'::jsonb))),
      case when p_item->>'organization' is null then array['organization_missing'] else array[]::text[] end,
      1.0,
      'extract-v1'
    ) on conflict (user_id, fingerprint) do update set
      title = excluded.title,
      organization = excluded.organization,
      location = excluded.location,
      deadline = excluded.deadline,
      application_url = excluded.application_url,
      description = excluded.description,
      type = excluded.type,
      trust_tier = excluded.trust_tier,
      source_badge = excluded.source_badge,
      catalog_id = excluded.catalog_id,
      risk_signals = excluded.risk_signals,
      seniority_level = excluded.seniority_level,
      skills = excluded.skills,
      updated_at = now()
    returning id into v_opp_id;

    -- Store extracted opportunity requirements if present
    if p_item->'requirements' is not null and jsonb_array_length(p_item->'requirements') > 0 then
      for req in select * from jsonb_array_elements(p_item->'requirements')
      loop
        insert into public.opportunity_requirements(
          opportunity_id, user_id, kind, value, mandatory, evidence_snippet
        ) values (
          v_opp_id,
          u.user_id,
          req->>'kind',
          req->>'value',
          coalesce((req->>'mandatory')::boolean, true),
          req->>'evidence'
        ) on conflict do nothing;
      end loop;
    end if;

    -- Automatically queue match evaluation if not already evaluated
    insert into public.matches(
      user_id, opportunity_id, decision, eligibility_status, match_score, confidence, explanation
    ) values (
      u.user_id,
      v_opp_id,
      'ASK',
      'UNKNOWN',
      null,
      null,
      'Newly discovered opportunity awaiting profile evaluation.'
    ) on conflict (user_id, opportunity_id) do nothing;
  end loop;

  return jsonb_build_object(
    'saved', true,
    'catalog_id', v_cat_id,
    'was_created', v_existing_id is null,
    'was_updated', v_existing_id is not null and v_existing_hash is distinct from v_content_hash,
    'rescan_unchanged', v_existing_id is not null and v_existing_hash = v_content_hash
  );
end;
$$;

revoke all on function public.worker_save_discovery_item(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.worker_save_discovery_item(uuid,jsonb,uuid) to service_role;

commit;
