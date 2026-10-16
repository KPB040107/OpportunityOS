-- Migration 0035: Discovery Volume Control, Diversity, Interactions, and Review Experience Repairs
-- Implements repairs for:
-- 1. User opportunity interactions (Save/Bookmark, Hide/Not Interested) - durable and private per user.
-- 2. User source preferences (normal, reduced, muted) - private per user.
-- 3. Seniority classification for opportunities & catalog (intern, entry, mid, senior, executive, uncertain).
-- 4. Bounded per-user projection respecting muted sources and student internship/entry-level relevance.
-- 5. Separation of missing information from actual approval:
--    - UNKNOWN eligibility strictly blocks approval creation (only ELIGIBLE matches can acquire approvals).
--    - Stale migration for existing pending UNKNOWN approvals.
-- 6. No-deadline decision policy (decision-v2) support in confirm_approval.
-- 7. Curated public feeds (Cloudflare Careers via greenhouse-v1, PostHog via ashby-v1) in source_registry.
-- 8. Diverse inbox projection query (max 3 per employer in top 12, search, filters, pagination).

begin;

-- ============================================================================
-- 1. User Opportunity Interactions (Save / Hide)
-- ============================================================================
create table if not exists public.user_opportunity_interactions (
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  is_saved boolean not null default false,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

alter table public.user_opportunity_interactions enable row level security;

drop policy if exists "Users manage own opportunity interactions" on public.user_opportunity_interactions;
create policy "Users manage own opportunity interactions"
  on public.user_opportunity_interactions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant all on public.user_opportunity_interactions to authenticated, service_role;

create or replace function public.toggle_opportunity_save(p_opportunity_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_curr boolean;
  v_next boolean;
begin
  if v_uid is null then raise exception 'Unauthorized'; end if;
  select is_saved into v_curr from public.user_opportunity_interactions where user_id = v_uid and opportunity_id = p_opportunity_id;
  v_next := not coalesce(v_curr, false);
  insert into public.user_opportunity_interactions(user_id, opportunity_id, is_saved, updated_at)
  values (v_uid, p_opportunity_id, v_next, now())
  on conflict (user_id, opportunity_id) do update set is_saved = v_next, updated_at = now();
  return v_next;
end; $$;

create or replace function public.toggle_opportunity_hide(p_opportunity_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_curr boolean;
  v_next boolean;
begin
  if v_uid is null then raise exception 'Unauthorized'; end if;
  select is_hidden into v_curr from public.user_opportunity_interactions where user_id = v_uid and opportunity_id = p_opportunity_id;
  v_next := not coalesce(v_curr, false);
  insert into public.user_opportunity_interactions(user_id, opportunity_id, is_hidden, updated_at)
  values (v_uid, p_opportunity_id, v_next, now())
  on conflict (user_id, opportunity_id) do update set is_hidden = v_next, updated_at = now();
  return v_next;
end; $$;

grant execute on function public.toggle_opportunity_save(uuid) to authenticated;
grant execute on function public.toggle_opportunity_hide(uuid) to authenticated;

-- ============================================================================
-- 2. User Source Preferences (Mute / Reduce Source)
-- ============================================================================
create table if not exists public.user_source_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_identifier text not null,
  preference text not null check (preference in ('normal', 'reduced', 'muted')) default 'normal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, source_identifier)
);

alter table public.user_source_preferences enable row level security;

drop policy if exists "Users manage own source preferences" on public.user_source_preferences;
create policy "Users manage own source preferences"
  on public.user_source_preferences
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant all on public.user_source_preferences to authenticated, service_role;

create or replace function public.set_source_preference(p_source text, p_preference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_src text := lower(trim(p_source));
begin
  if v_uid is null then raise exception 'Unauthorized'; end if;
  if p_preference not in ('normal', 'reduced', 'muted') then raise exception 'Invalid preference'; end if;
  insert into public.user_source_preferences(user_id, source_identifier, preference, updated_at)
  values (v_uid, v_src, p_preference, now())
  on conflict (user_id, source_identifier) do update set preference = p_preference, updated_at = now();
  return jsonb_build_object('success', true, 'source', v_src, 'preference', p_preference);
end; $$;

grant execute on function public.set_source_preference(text, text) to authenticated;

-- ============================================================================
-- 3. Seniority Classification
-- ============================================================================
alter table opportunityos_private.catalog_opportunities
  add column if not exists seniority_level text check (seniority_level in ('intern', 'entry', 'mid', 'senior', 'executive', 'uncertain')) default 'uncertain';

alter table public.opportunities
  add column if not exists seniority_level text check (seniority_level in ('intern', 'entry', 'mid', 'senior', 'executive', 'uncertain')) default 'uncertain';

create or replace function public.classify_seniority(p_title text, p_commitment text default '')
returns text language plpgsql immutable as $$
declare
  t text := lower(coalesce(p_title, ''));
  c text := lower(coalesce(p_commitment, ''));
  combined text := t || ' ' || c;
  has_intern boolean;
  has_exec boolean;
  has_senior boolean;
  has_entry boolean;
begin
  -- 1. Internships, trainees, apprentices, fellowships
  has_intern := combined ~ '\y(intern|internship|trainee|apprentice|fellow|fellowship)\y';
  if has_intern then
    return 'intern';
  end if;

  -- 2. Executive / Leadership
  has_exec := combined ~ '\y(director|vice president|vp|chief|head of|general manager|partner)\y';
  if has_exec then
    return 'executive';
  end if;

  -- 3. Senior / Staff / Principal / Lead / Manager
  has_senior := combined ~ '\y(senior|sr\.?|lead|principal|staff|manager|architect|mgr)\y';

  -- 4. Entry-level / Junior / Fresher
  -- Note: Do not infer every title with "associate" is junior (e.g. Associate Director is executive).
  -- Explicit entry titles: "Associate Engineer", "Associate Software Engineer", "Associate Consultant", "Junior", "Fresher"
  has_entry := combined ~ '\y(junior|jr\.?|entry[- ]level|graduate engineer|fresher|associate (?:software|engineer|developer|consultant|analyst|qa|tester|product))\y'
               or (combined ~ '\yassociate\y' and not has_senior and not has_exec);

  if has_entry and not has_senior then
    return 'entry';
  end if;

  if has_senior then
    return 'senior';
  end if;

  -- 5. Standard mid-level roles
  if combined ~ '\y(software engineer|developer|analyst|specialist|designer|consultant)\y' then
    return 'mid';
  end if;

  return 'uncertain';
end;
$$;

grant execute on function public.classify_seniority(text, text) to public, authenticated, service_role;

-- Backfill existing catalog and opportunities
update opportunityos_private.catalog_opportunities
set seniority_level = public.classify_seniority(title, coalesce(structured_fields->>'commitment', ''))
where seniority_level is null or seniority_level = 'uncertain';

update public.opportunities
set seniority_level = public.classify_seniority(title)
where seniority_level is null or seniority_level = 'uncertain';

-- ============================================================================
-- 4. Bounded Discovery Projection with Relevance & Mute Checks
-- ============================================================================
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

  v_type := p_item->>'type';
  -- Scope guard: strictly job, internship, or hackathon
  if v_type not in ('job', 'internship', 'hackathon') then
    return jsonb_build_object('saved', false, 'ignored_reason', 'out_of_scope_type');
  end if;

  -- Classify seniority
  v_seniority := public.classify_seniority(p_item->>'title', coalesce(p_item->'fields'->>'commitment', ''));

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
    encode(extensions.digest(concat(p_item->>'title', ':', coalesce(p_item->>'location', ''), ':', coalesce(p_item->>'raw_text', ''))::bytea, 'sha256'), 'hex')
  );

  -- Check existing catalog entry for deduplicating rescans
  select id, content_hash into v_existing_id, v_existing_hash
  from opportunityos_private.catalog_opportunities
  where stable_key = concat(v_run.adapter, ':', p_item->>'external_id');

  if v_existing_id is not null and v_existing_hash = v_content_hash then
    -- Rescanning unchanged source: update timestamp but do not re-queue evaluation
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
    p_item->>'title',
    p_item->>'organization',
    v_type,
    p_item->>'location',
    v_deadline,
    p_item->>'application_url',
    p_item->>'original_url',
    v_trust_tier,
    v_risk_signals,
    v_content_hash,
    coalesce(p_item->>'raw_text', p_item->>'title'),
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

  -- Project to users with relevance and mute filtering
  for u in 
    select p.user_id, p.interest_types, p.career_goals
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

    -- Relevance check for student profiles:
    -- If profile is seeking internships (or has empty interests), senior/executive roles are excluded
    -- from main user projection unless explicitly supported by career goals
    v_is_intern_seeker := (u.interest_types is null or cardinality(u.interest_types) = 0 or 'internship' = any(u.interest_types));
    if v_is_intern_seeker and v_seniority in ('senior', 'executive') then
      if not (coalesce(u.career_goals, '') ~* 'senior|lead|manager|director') then
        -- Keep in shared catalog; do not flood student inbox with senior/director roles
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
      concat('DISCOVERED: ', p_item->>'title', ' from ', v_source_badge, E'\n', coalesce(p_item->>'raw_text', '')),
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
      u.user_id, v_fp, p_item->>'title', p_item->>'organization',
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

-- ============================================================================
-- 5. Separate Missing Information from Actual Approval
-- ============================================================================
-- Enforce at the database boundary: Approvals are strictly for ELIGIBLE matches.
-- UNKNOWN eligibility MUST NEVER acquire an approval row or actionable card.
create or replace function public.worker_create_approval(p_match uuid, p_execution text, p_resume text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c jsonb;
  m public.matches%rowtype;
  o public.opportunities%rowtype;
  a public.approvals%rowtype;
  expiry timestamptz;
begin
  if p_execution is null or p_execution !~ '^[0-9]+$' or p_resume is null or p_resume !~ ('^http://localhost:5678/webhook-waiting/'||p_execution||'/?([?]signature=[a-f0-9]{64})?$') then
    raise exception 'Invalid execution binding';
  end if;

  select * into m from public.matches where id = p_match and status = 'complete' and decision = 'ASK' for update;
  if not found then
    return jsonb_build_object('created', false, 'reason', 'MATCH_NOT_FOUND_OR_NOT_ASK');
  end if;

  -- Safety boundary: Approvals are strictly for ELIGIBLE matches.
  if m.eligibility_status <> 'ELIGIBLE' then
    return jsonb_build_object('created', false, 'reason', 'NON_ELIGIBLE_CANNOT_APPROVE');
  end if;

  select * into o from public.opportunities where id = m.opportunity_id and user_id = m.user_id;
  expiry := least(now() + interval '48 hours', coalesce(o.deadline::timestamp at time zone 'Asia/Kolkata', now() + interval '48 hours'));
  if expiry <= now() then
    return jsonb_build_object('created', false, 'reason', 'EXPIRED');
  end if;

  update public.approvals set status = 'stale', resume_status = 'stale' where match_id = m.id and match_revision <> m.revision and status = 'pending';

  insert into public.approvals(user_id, match_id, reason, missing_info, match_revision, expires_at, requires_information, resume_status)
  values(m.user_id, m.id, m.explanation, m.reason_codes, m.revision, expiry, false, 'waiting')
  on conflict(user_id, match_id, match_revision) do nothing
  returning * into a;

  if a.id is null then
    return jsonb_build_object('created', false, 'reason', 'ALREADY_EXISTS');
  end if;

  insert into opportunityos_private.approval_execution(approval_id, execution_id, resume_url)
  values(a.id, p_execution, p_resume);

  c := public.worker_match_context(m.id, p_execution, '05-ask');
  perform public.worker_queue_action(m.id, 'approval_notification', jsonb_build_object('approval_id', a.id, 'expires_at', expiry, 'requires_information', false), 'approval-' || a.id::text);
  insert into public.events(user_id, stage, level, message, metadata)
  values(m.user_id, 'ask', 'info', 'Review requested; execution will wait', jsonb_build_object('approval_id', a.id, 'match_id', m.id));

  return c || jsonb_build_object('created', true, 'approval_id', a.id, 'expires_at', expiry);
end;
$$;

revoke all on function public.worker_create_approval(uuid, text, text) from public, anon;
grant execute on function public.worker_create_approval(uuid, text, text) to service_role;

-- Safely mark existing pending UNKNOWN approvals as stale so they are moved out of the actionable queue
update public.approvals
set status = 'stale',
    resume_status = 'stale',
    updated_at = now()
where status = 'pending'
  and (requires_information = true or exists (
    select 1 from public.matches m where m.id = approvals.match_id and m.eligibility_status <> 'ELIGIBLE'
  ));

-- ============================================================================
-- 6. No-Deadline Decision Policy (decision-v2) in confirm_approval
-- ============================================================================
create or replace function public.confirm_approval(
  p_id uuid,
  p_revision bigint,
  p_outcome text,
  p_reason text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a public.approvals%rowtype;
  m public.matches%rowtype;
  owner_id uuid := auth.uid();
begin
  if owner_id is null or p_outcome not in ('approved','rejected') or length(p_reason) > 2000 then 
    raise exception 'Invalid authenticated decision';
  end if;

  select * into a from public.approvals where id = p_id and user_id = owner_id and match_revision = p_revision for update;
  if not found then 
    raise exception 'Approval not found';
  end if;

  if a.status <> 'pending' then 
    return jsonb_build_object('accepted', false, 'reason', 'ALREADY_RESOLVED');
  end if;

  if a.expires_at <= now() then 
    update public.approvals set status = 'expired', resume_status = 'expired' where id = a.id;
    return jsonb_build_object('accepted', false, 'reason', 'EXPIRED');
  end if;

  select * into m from public.matches where id = a.match_id and user_id = owner_id and revision = a.match_revision and status = 'complete' for update;
  if m.id is null then 
    update public.approvals set status = 'stale', resume_status = 'stale' where id = a.id;
    return jsonb_build_object('accepted', false, 'reason', 'STALE');
  end if;

  -- Block approval if information is missing or eligibility is not ELIGIBLE
  if p_outcome = 'approved' and (a.requires_information or m.eligibility_status <> 'ELIGIBLE') then 
    return jsonb_build_object('accepted', false, 'reason', 'CORRECT_INFORMATION_REQUIRED');
  end if;

  -- Allow opportunities where deadline is null (e.g. jobs/internships with no stated deadline under decision-v2) or in the future
  if p_outcome = 'approved' and not exists(
    select 1 from public.opportunities 
    where id = m.opportunity_id 
      and user_id = owner_id 
      and (deadline is null or deadline > (now() at time zone 'Asia/Kolkata')::date)
  ) then 
    return jsonb_build_object('accepted', false, 'reason', 'EXPIRED');
  end if;

  if not exists(select 1 from opportunityos_private.approval_execution where approval_id = a.id) then 
    return jsonb_build_object('accepted', false, 'reason', 'EXECUTION_UNBOUND');
  end if;

  update public.approvals set status = p_outcome, decided_at = now(), updated_at = now(), resume_status = 'pending' where id = a.id;
  insert into public.user_feedback(user_id, match_id, outcome, reason) values (owner_id, m.id, p_outcome, p_reason);
  insert into public.events(user_id, stage, level, message, metadata) values (owner_id, 'approval', 'info', 'Review decision recorded: ' || p_outcome, jsonb_build_object('approval_id', a.id, 'match_id', m.id));

  return jsonb_build_object('accepted', true, 'resume_status', 'pending');
end; $$;

revoke all on function public.confirm_approval(uuid, bigint, text, text) from public, anon;
grant execute on function public.confirm_approval(uuid, bigint, text, text) to authenticated;

-- ============================================================================
-- 7. Curated Public Employer Sources
-- ============================================================================
insert into opportunityos_private.source_registry (name, adapter, source_kind, config, allowed_hosts, status)
values
  ('Cloudflare Careers', 'greenhouse-v1', 'company_feed', '{"company": "cloudflare"}'::jsonb, ARRAY['boards-api.greenhouse.io'], 'active'),
  ('PostHog Careers', 'ashby-v1', 'company_feed', '{"company": "posthog"}'::jsonb, ARRAY['api.ashbyhq.com'], 'active')
on conflict do nothing;

-- ============================================================================
-- 8. Inbox Recommendations and Diversity Query RPC
-- ============================================================================
create or replace function public.get_inbox_feed(
  p_view text default 'best',
  p_type text default null,
  p_employer text default null,
  p_eligibility text default null,
  p_decision text default null,
  p_saved_only boolean default false,
  p_include_hidden boolean default false,
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
) returns table (
  opportunity_id uuid,
  title text,
  organization text,
  deadline date,
  location text,
  type text,
  application_url text,
  description text,
  skills text[],
  ambiguity_flags text[],
  extraction_confidence numeric,
  trust_tier text,
  source_badge text,
  risk_signals text[],
  seniority_level text,
  created_at timestamptz,
  is_saved boolean,
  is_hidden boolean,
  match_id uuid,
  match_status text,
  match_score numeric,
  confidence numeric,
  decision text,
  eligibility_status text,
  explanation text,
  reason_codes text[],
  component_scores jsonb,
  employer_rank bigint
) language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Unauthorized'; end if;

  return query
  with user_opps as (
    select
      o.id as opportunity_id,
      o.title,
      o.organization,
      o.deadline,
      o.location,
      o.type,
      o.application_url,
      o.description,
      o.skills,
      o.ambiguity_flags,
      o.extraction_confidence,
      o.trust_tier,
      o.source_badge,
      o.risk_signals,
      o.seniority_level,
      o.created_at,
      coalesce(ui.is_saved, false) as is_saved,
      coalesce(ui.is_hidden, false) as is_hidden,
      m.id as match_id,
      m.status as match_status,
      m.match_score,
      m.confidence,
      m.decision,
      m.eligibility_status,
      m.explanation,
      m.reason_codes,
      to_jsonb(m.component_scores) as component_scores,
      sp.preference as source_pref,
      -- Rank per employer for diversity capping
      row_number() over (
        partition by lower(coalesce(o.organization, 'unknown'))
        order by 
          case when m.decision = 'ACT' then 1 when m.decision = 'ASK' then 2 else 3 end,
          coalesce(m.match_score, 0) desc,
          case when o.seniority_level = 'intern' then 1 when o.seniority_level = 'entry' then 2 else 3 end,
          o.created_at desc
      ) as emp_rank
    from public.opportunities o
    left join public.matches m on m.opportunity_id = o.id and m.user_id = v_uid and m.status = 'complete'
    left join public.user_opportunity_interactions ui on ui.opportunity_id = o.id and ui.user_id = v_uid
    left join public.user_source_preferences sp on sp.source_identifier = lower(coalesce(o.organization, '')) and sp.user_id = v_uid
    where o.user_id = v_uid
      -- Hidden filtering
      and (p_include_hidden or not coalesce(ui.is_hidden, false))
      -- Saved only filtering
      and (not p_saved_only or coalesce(ui.is_saved, false) = true)
      -- Muted sources filtering (muted sources excluded unless explicitly filtered by employer)
      and (p_employer is not null or coalesce(sp.preference, 'normal') <> 'muted')
      -- Type filter
      and (p_type is null or o.type = p_type)
      -- Employer filter
      and (p_employer is null or lower(o.organization) = lower(p_employer))
      -- Eligibility filter
      and (p_eligibility is null or m.eligibility_status = p_eligibility)
      -- Decision filter
      and (p_decision is null or m.decision = p_decision)
      -- Search query
      and (
        p_search is null 
        or length(trim(p_search)) = 0
        or o.title ilike '%' || trim(p_search) || '%'
        or o.organization ilike '%' || trim(p_search) || '%'
        or o.description ilike '%' || trim(p_search) || '%'
        or exists (select 1 from unnest(o.skills) s where s ilike '%' || trim(p_search) || '%')
      )
  )
  select
    uo.opportunity_id,
    uo.title,
    uo.organization,
    uo.deadline,
    uo.location,
    uo.type,
    uo.application_url,
    uo.description,
    uo.skills,
    uo.ambiguity_flags,
    uo.extraction_confidence,
    uo.trust_tier,
    uo.source_badge,
    uo.risk_signals,
    uo.seniority_level,
    uo.created_at,
    uo.is_saved,
    uo.is_hidden,
    uo.match_id,
    uo.match_status,
    uo.match_score,
    uo.confidence,
    uo.decision,
    uo.eligibility_status,
    uo.explanation,
    uo.reason_codes,
    uo.component_scores,
    uo.emp_rank as employer_rank
  from user_opps uo
  order by
    case when p_view = 'best' then
      -- Diversity in Best Matches view: cap employer dominance
      case when uo.emp_rank <= 3 then 0 else 1 end
    else 0 end,
    case when uo.decision = 'ACT' then 1 when uo.decision = 'ASK' then 2 else 3 end,
    coalesce(uo.match_score, 0) desc,
    case when uo.seniority_level = 'intern' then 1 when uo.seniority_level = 'entry' then 2 else 3 end,
    uo.created_at desc
  limit p_limit
  offset p_offset;
end; $$;

grant execute on function public.get_inbox_feed(text, text, text, text, text, boolean, boolean, text, int, int) to authenticated;

commit;
