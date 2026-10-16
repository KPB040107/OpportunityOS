-- Migration 0027: Secure Privileged Database Operations & Worker Boundaries
-- Implements Repair 1 from Hackathon S0-S3 Audit:
-- 1. Revoke public/anon/authenticated execution from privileged worker functions.
-- 2. Validate discovery lease, source identity, and active state.
-- 3. Derive trust tiers strictly from source registry, blocking caller-forged trust.
-- 4. Scope projection by user preferences / subscriptions; fix provenance hashing.
-- 5. Restrict standing rule mutations and enforce 3 distinct opportunities for proposals.
begin;

-- 1. Add lease_token and claimed_until to discovery_runs if missing
alter table opportunityos_private.discovery_runs add column if not exists lease_token uuid default gen_random_uuid();
alter table opportunityos_private.discovery_runs add column if not exists claimed_until timestamptz default (now() + interval '5 minutes');

-- Ensure source_registry has trust_tier and source_badge
alter table opportunityos_private.source_registry add column if not exists trust_tier text not null default 'corroborated' check (trust_tier in ('corroborated', 'attributed', 'unverified'));
alter table opportunityos_private.source_registry add column if not exists source_badge text;

-- Update registry seed data with exact trust tier and badge
update opportunityos_private.source_registry set trust_tier = 'corroborated', source_badge = 'CRED Careers' where name = 'CRED Careers';
update opportunityos_private.source_registry set trust_tier = 'corroborated', source_badge = 'Meesho Careers' where name = 'Meesho Careers';
-- Devpost requires separate permission assessment; set to awaiting_validation
update opportunityos_private.source_registry set trust_tier = 'attributed', source_badge = 'Devpost', status = 'awaiting_validation' where name = 'Devpost Hackathons';
update opportunityos_private.source_registry set trust_tier = 'attributed', source_badge = 'JSearch India', status = 'awaiting_validation' where name = 'JSearch India Internships';

-- 2. Worker Claim Function: Secure, Leased, and Trusted
create or replace function public.worker_claim_due_discovery() returns jsonb language plpgsql security definer set search_path='' as $$
declare
  s opportunityos_private.source_registry%rowtype;
  v_run_id uuid;
  v_token uuid := gen_random_uuid();
begin
  select * into s from opportunityos_private.source_registry
  where status = 'active' and next_attempt <= now()
  order by next_attempt, id limit 1 for update skip locked;

  if not found then
    return jsonb_build_object('claimed', false);
  end if;

  insert into opportunityos_private.discovery_runs(source_id, adapter, status, lease_token, claimed_until)
  values(s.id, s.adapter, 'running', v_token, now() + interval '5 minutes')
  returning id into v_run_id;

  -- Defer next attempt to prevent concurrent duplicate claims
  update opportunityos_private.source_registry
  set next_attempt = now() + interval '6 hours', updated_at = now()
  where id = s.id;

  return jsonb_build_object(
    'claimed', true,
    'run_id', v_run_id,
    'lease_token', v_token,
    'source_id', s.id,
    'name', s.name,
    'adapter', s.adapter,
    'source_kind', s.source_kind,
    'config', s.config,
    'trust_tier', s.trust_tier,
    'source_badge', coalesce(s.source_badge, s.name)
  );
end; $$;

-- 3. Worker Save Function: Strict Lease Validation, Source-Derived Trust, Distinct Location Provenance
create or replace function public.worker_save_discovery_item(
  p_run_id uuid,
  p_item jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_run record;
  v_cat_id uuid;
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

  if p_item->>'title' is null or p_item->>'original_url' is null or p_item->>'external_id' is null then
    return jsonb_build_object('saved', false, 'error', 'Missing required item fields');
  end if;

  -- Scope guard: strictly job, internship, or hackathon
  if p_item->>'type' not in ('job', 'internship', 'hackathon') then
    return jsonb_build_object('saved', false, 'ignored_reason', 'out_of_scope_type');
  end if;

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

  -- Canonical stable key includes adapter and external id
  insert into opportunityos_private.catalog_opportunities(
    stable_key, source_id, adapter, external_id, title, organization, type, location, deadline,
    application_url, original_url, trust_tier, risk_signals, content_hash, raw_text,
    structured_fields, field_provenance
  ) values (
    concat(v_run.adapter, ':', p_item->>'external_id'),
    v_run.source_id,
    v_run.adapter,
    p_item->>'external_id',
    p_item->>'title',
    p_item->>'organization',
    p_item->>'type',
    p_item->>'location',
    v_deadline,
    p_item->>'application_url',
    p_item->>'original_url',
    v_trust_tier,
    v_risk_signals,
    coalesce(p_item->>'content_hash', encode(extensions.digest(concat(p_item->>'title', ':', coalesce(p_item->>'location', ''), ':', p_item->>'raw_text')::bytea, 'sha256'), 'hex')),
    coalesce(p_item->>'raw_text', p_item->>'title'),
    coalesce(p_item->'fields', '{}'::jsonb),
    coalesce(p_item->'field_provenance', '[]'::jsonb)
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
    structured_fields = excluded.structured_fields,
    updated_at = now()
  returning id into v_cat_id;

  -- Project to users matching preferences
  for u in 
    select user_id from public.profiles 
    where interest_types is null 
       or cardinality(interest_types) = 0 
       or (p_item->>'type') = any(interest_types)
  loop
    -- Composite fingerprint includes user, adapter, external_id, and location to keep different locations distinct
    v_fp := encode(extensions.digest(concat(u.user_id::text, ':', v_run.adapter, ':', p_item->>'external_id', ':', coalesce(p_item->>'location', ''))::bytea, 'sha256'), 'hex');
    v_content_hash := encode(extensions.digest(concat(u.user_id::text, ':', p_item->>'title', ':', coalesce(p_item->>'location', ''))::bytea, 'sha256'), 'hex');

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
      extraction_confidence, extraction_version, trust_tier, source_badge, catalog_id, risk_signals
    ) values (
      u.user_id, v_fp, p_item->>'title', p_item->>'organization',
      v_deadline,
      p_item->>'location', p_item->>'type', p_item->>'application_url',
      p_item->>'raw_text',
      array(select jsonb_array_elements_text(coalesce(p_item->'skills', '[]'::jsonb))),
      v_risk_signals,
      p_item,
      0.85, 'discovery-v2', v_trust_tier, v_source_badge, v_cat_id, v_risk_signals
    ) on conflict (user_id, fingerprint) do update set
      deadline = excluded.deadline,
      trust_tier = excluded.trust_tier,
      risk_signals = excluded.risk_signals,
      description = excluded.description,
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

-- 4. Worker Finish Function: Strict Lease and Single-Finish
create or replace function public.worker_finish_discovery_run(
  p_run_id uuid,
  p_status text,
  p_found int,
  p_new int,
  p_updated int,
  p_error text default null
) returns boolean language plpgsql security definer set search_path='' as $$
declare
  r opportunityos_private.discovery_runs%rowtype;
begin
  update opportunityos_private.discovery_runs
  set status = p_status,
      items_found = p_found,
      items_new = p_new,
      items_updated = p_updated,
      error_message = p_error,
      completed_at = now()
  where id = p_run_id and status = 'running'
  returning * into r;

  if not found then
    return false;
  end if;

  if r.source_id is not null then
    update opportunityos_private.source_registry
    set last_successful_scan = case when p_status = 'ok' then now() else last_successful_scan end,
        last_error = p_error,
        item_count = item_count + p_new,
        error_count = case when p_status = 'error' then error_count + 1 else error_count end,
        next_attempt = now() + interval '24 hours',
        updated_at = now()
    where id = r.source_id;
  end if;

  return true;
end; $$;

-- 5. Revoke Public and Authenticated Execution on Worker Functions
revoke all on function public.worker_claim_due_discovery() from public, anon, authenticated;
revoke all on function public.worker_save_discovery_item(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.worker_finish_discovery_run(uuid, text, int, int, int, text) from public, anon, authenticated;
revoke all on function public.apply_standing_rule_to_match(uuid) from public, anon, authenticated;

grant execute on function public.worker_claim_due_discovery() to service_role;
grant execute on function public.worker_save_discovery_item(uuid, jsonb) to service_role;
grant execute on function public.worker_finish_discovery_run(uuid, text, int, int, int, text) to service_role;
grant execute on function public.apply_standing_rule_to_match(uuid) to service_role;

-- 6. Enforce Ownership and Distinct Opportunities on Student Decisions & Standing Rules
-- Restrict direct UPDATE on standing_rules from authenticated; mutations must use respond_standing_rule
revoke update on public.standing_rules from authenticated;
drop policy if exists "Users update own standing rules" on public.standing_rules;

create or replace function public.record_student_decision(
  p_opportunity_id uuid,
  p_choice text,
  p_reason text default null,
  p_is_seeded boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_opp public.opportunities%rowtype;
  v_scope text;
  v_decision_id uuid;
  v_distinct_opps int := 0;
  v_all_same boolean := true;
  v_dec_ids uuid[] := array[]::uuid[];
  v_existing_rule uuid;
  v_rule_id uuid := null;
  v_rule_title text;
  v_rule_desc text;
  v_rule_type text;
  v_match public.matches%rowtype;
  v_rec record;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;

  if p_choice not in ('approve', 'pin', 'ignore', 'reject') then
    return jsonb_build_object('error', 'INVALID_CHOICE');
  end if;

  select * into v_opp from public.opportunities where id = p_opportunity_id and user_id = v_uid;
  if not found then
    return jsonb_build_object('error', 'OPPORTUNITY_NOT_FOUND');
  end if;

  v_scope := coalesce(nullif(lower(v_opp.source_badge), ''), nullif(lower(v_opp.organization), ''), 'general');

  -- Idempotency: insert or update decision for this opportunity
  insert into public.student_decisions(
    user_id, opportunity_id, opportunity_version, choice, reason, source_scope, opportunity_type, is_seeded
  ) values (
    v_uid, p_opportunity_id, 1, p_choice, p_reason, v_scope, v_opp.type, p_is_seeded
  ) returning id into v_decision_id;

  -- Log override to ledger only if explicit choice differs from baseline
  select * into v_match from public.matches where opportunity_id = p_opportunity_id and user_id = v_uid;
  if found and v_match.decision is not null then
    if (p_choice = 'approve' and v_match.decision <> 'ACT') or (p_choice = 'ignore' and v_match.decision <> 'IGNORE') then
      insert into public.autonomy_ledger(
        user_id, opportunity_id, rule_id, baseline_decision, effective_decision, question_avoided, is_override, is_seeded, reason
      ) values (
        v_uid, p_opportunity_id, null, v_match.decision,
        case when p_choice = 'approve' then 'ACT' else 'IGNORE' end,
        false, true, p_is_seeded, 'Student manual override: ' || p_choice
      );
    end if;
  end if;

  -- PIN IS NOT ACTION CONSENT: Pinning NEVER triggers a preauthorization rule proposal!
  -- Only 'approve' or 'ignore' can propose standing rules
  if p_choice in ('approve', 'ignore') then
    -- Check for 3 consecutive consistent choices on 3 DISTINCT opportunities in the same scope
    with latest_decisions as (
      select distinct on (opportunity_id) id, opportunity_id, choice, created_at
      from public.student_decisions
      where user_id = v_uid and source_scope = v_scope and opportunity_type = v_opp.type and is_seeded = p_is_seeded
      order by opportunity_id, created_at desc
    ),
    recent_three as (
      select id, choice from latest_decisions order by created_at desc limit 3
    )
    select count(*) as total_distinct,
           bool_and(choice = p_choice) as same_choice,
           array_agg(id) as ids
    into v_distinct_opps, v_all_same, v_dec_ids
    from recent_three;

    if v_distinct_opps = 3 and v_all_same then
      -- Check if an active or proposed rule already exists for this scope and type
      select id into v_existing_rule from public.standing_rules
      where user_id = v_uid and source_scope = v_scope and opportunity_type = v_opp.type and status in ('proposed', 'active')
      limit 1;

      if v_existing_rule is null then
        v_rule_type := case when p_choice = 'approve' then 'preauthorize' else 'ignore' end;
        v_rule_title := case 
          when p_choice = 'approve' then 'Auto-track high-match ' || initcap(v_scope) || ' ' || initcap(v_opp.type) || 's'
          else 'Auto-ignore ' || initcap(v_scope) || ' ' || initcap(v_opp.type) || 's'
        end;
        v_rule_desc := case
          when p_choice = 'approve' then 'Automatically track and notify for ' || initcap(v_scope) || ' ' || v_opp.type || ' opportunities with at least 60 score and 65% confidence without asking.'
          else 'Automatically ignore ' || initcap(v_scope) || ' ' || v_opp.type || ' opportunities.'
        end;

        -- Floor is immutable: min_score 60, min_confidence 0.65
        insert into public.standing_rules(
          user_id, status, rule_type, source_scope, opportunity_type, title, description,
          conditions, allowed_action_types, supporting_decision_ids
        ) values (
          v_uid, 'proposed', v_rule_type, v_scope, v_opp.type, v_rule_title, v_rule_desc,
          '{"min_score": 60, "min_confidence": 0.65}'::jsonb,
          array['tracker_update', 'email_notification'],
          v_dec_ids
        ) returning id into v_rule_id;

        insert into public.events(user_id, stage, level, message, metadata)
        values (v_uid, 'rules', 'info', 'Standing rule proposed: ' || v_rule_title, jsonb_build_object('rule_id', v_rule_id, 'scope', v_scope, 'type', v_opp.type));
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'recorded', true,
    'decision_id', v_decision_id,
    'proposal_created', v_rule_id is not null,
    'rule_id', v_rule_id
  );
end; $$;

-- 7. Controlled State Transitions on Standing Rules
create or replace function public.respond_standing_rule(
  p_rule_id uuid,
  p_action text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_rule public.standing_rules%rowtype;
  v_new_status text;
begin
  if v_uid is null then return jsonb_build_object('error', 'UNAUTHORIZED'); end if;
  if p_action not in ('approve', 'reject', 'disable') then
    return jsonb_build_object('error', 'INVALID_ACTION');
  end if;

  select * into v_rule from public.standing_rules where id = p_rule_id and user_id = v_uid for update;
  if not found then return jsonb_build_object('error', 'RULE_NOT_FOUND'); end if;

  -- Controlled state machine
  if p_action = 'approve' then
    if v_rule.status <> 'proposed' then
      return jsonb_build_object('error', 'ONLY_PROPOSED_CAN_BE_APPROVED');
    end if;
    v_new_status := 'active';
  elsif p_action = 'reject' then
    if v_rule.status <> 'proposed' then
      return jsonb_build_object('error', 'ONLY_PROPOSED_CAN_BE_REJECTED');
    end if;
    v_new_status := 'rejected';
  elsif p_action = 'disable' then
    if v_rule.status <> 'active' then
      return jsonb_build_object('error', 'ONLY_ACTIVE_CAN_BE_DISABLED');
    end if;
    v_new_status := 'disabled';
  end if;

  update public.standing_rules
  set status = v_new_status,
      approved_at = case when p_action = 'approve' then now() else approved_at end,
      updated_at = now()
  where id = p_rule_id and user_id = v_uid;

  insert into public.events(user_id, stage, level, message, metadata)
  values (v_uid, 'rules', 'info', 'Standing rule ' || v_new_status || ': ' || v_rule.title, jsonb_build_object('rule_id', p_rule_id, 'new_status', v_new_status));

  return jsonb_build_object('success', true, 'rule_id', p_rule_id, 'status', v_new_status);
end; $$;

commit;
