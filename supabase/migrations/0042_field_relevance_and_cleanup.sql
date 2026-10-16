-- Migration 0042: Field of Study & Domain Relevance Guard
-- 1. Updates worker_save_discovery_item to filter out unrelated roles (Sales, Marketing, HR, Finance, Legal, Logistics)
--    when projecting discovered opportunities to students studying Computer Science or Data Science.
-- 2. Respects the hierarchical domain relationship:
--    - Computer Science students receive CS/Software roles AND Data Science/AI/ML roles.
--    - Data Science students receive Data Science/AI/ML roles AND general Computer Science/Software roles.
-- 3. Cleans up existing irrelevant non-tech evaluation matches and stale approvals.

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

  if p_lease_token is not null and v_run.lease_token is distinct from p_lease_token then
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

  if v_existing_id is not null and v_existing_hash = v_content_hash then
    update opportunityos_private.catalog_opportunities
    set updated_at = now()
    where id = v_existing_id;

    return jsonb_build_object('saved', true, 'was_created', false, 'catalog_id', v_existing_id, 'rescan_unchanged', true);
  end if;

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
    select p.user_id, p.interest_types, p.career_goals, p.branch
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

    -- Field & Domain relevance check:
    -- If user has a CS, IT, or Data Science branch, exclude non-technical roles
    if v_type <> 'hackathon' and coalesce(u.branch, '') ~* 'computer|software|cse|cs|information technology|infotech|data science|data analytics|machine learning|ai & ds|ai and ds|ai' then
      if v_title ~* '\b(account executive|sales executive|sales manager|business development representative|bdr|sdr|inside sales|commercial hunter|commercial grower|telecaller|general counsel|legal counsel|privacy counsel|paralegal|attorney|lawyer|compliance manager|business finance|corporate finance|statutory audit|tax manager|financial controller|accounts payable|accounts receivable|performance marketing|growth marketing|brand marketing|seo specialist|social media manager|copywriter|human resources|recruiter|talent acquisition|hrbp|cluster head|last mile|warehouse manager|fleet manager|logistics coordinator|facilities manager|loss prevention|security & investigation|nurse|physician|chef)\b'
         and not (v_title ~* '\b(software|developer|sde|swe|engineer|engineering|data scientist|data science|data analyst|machine learning|deep learning|artificial intelligence|security|devops|cloud|qa|test)\b') then
        continue; -- Skip projecting unrelated roles to CS/DS student
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

      perform public.enqueue_evaluation(u.user_id, v_opp_id);
      v_was_created := true;
    end if;
  end loop;

  return jsonb_build_object('saved', true, 'catalog_id', v_cat_id, 'was_created', v_was_created);
end; $$;

revoke all on function public.worker_save_discovery_item(uuid, jsonb, uuid) from public, anon;
grant execute on function public.worker_save_discovery_item(uuid, jsonb, uuid) to service_role;

-- Clean up existing matches that are outside CS/DS field for users in CS/DS branches
update public.matches m
set decision = 'IGNORE',
    eligibility_status = 'INELIGIBLE',
    explanation = 'This role is outside your field of study (Computer Science / Data Science).'
from public.opportunities o, public.profiles p
where m.opportunity_id = o.id
  and m.user_id = p.user_id
  and o.type <> 'hackathon'
  and coalesce(p.branch, '') ~* 'computer|software|cse|cs|information technology|infotech|data science|data analytics|machine learning|ai & ds|ai and ds|ai'
  and o.title ~* '\b(account executive|sales executive|sales manager|business development representative|bdr|sdr|inside sales|commercial hunter|commercial grower|telecaller|general counsel|legal counsel|privacy counsel|paralegal|attorney|lawyer|compliance manager|business finance|corporate finance|statutory audit|tax manager|financial controller|accounts payable|accounts receivable|performance marketing|growth marketing|brand marketing|seo specialist|social media manager|copywriter|human resources|recruiter|talent acquisition|hrbp|cluster head|last mile|warehouse manager|fleet manager|logistics coordinator|facilities manager|loss prevention|security & investigation|nurse|physician|chef)\b'
  and not (o.title ~* '\b(software|developer|sde|swe|engineer|engineering|data scientist|data science|data analyst|machine learning|deep learning|artificial intelligence|security|devops|cloud|qa|test)\b');

-- Mark any stale approvals referencing these ineligible matches
update public.approvals a
set status = 'stale'
from public.matches m
where a.match_id = m.id
  and m.decision = 'IGNORE'
  and m.eligibility_status = 'INELIGIBLE'
  and a.status = 'pending';

commit;
