-- Migration 0025: Standing Rules and Autonomy Ledger
-- Implements Hackathon Demo Build Guide v3.0 Slice S3 & Decision D7:
-- 3 consecutive consistent explicit decisions -> propose typed standing rule
-- Autonomy ledger tracking rule usage, overrides, and questions avoided
-- Home screen counter computed from records with real vs seeded breakdown
begin;

-- 1. Student Decisions Table
create table if not exists public.student_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  opportunity_version integer not null default 1,
  choice text not null check (choice in ('approve', 'reject', 'ignore', 'pin')),
  reason text,
  source_scope text not null,
  opportunity_type text not null check (opportunity_type in ('job', 'internship', 'hackathon')),
  is_seeded boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_student_decisions_scope 
  on public.student_decisions(user_id, source_scope, opportunity_type, is_seeded, created_at desc);

alter table public.student_decisions enable row level security;

create policy "Users view own decisions" on public.student_decisions
  for select to authenticated using (auth.uid() = user_id);

create policy "Users insert own decisions" on public.student_decisions
  for insert to authenticated with check (auth.uid() = user_id);

-- 2. Standing Rules Table
create table if not exists public.standing_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'proposed' check (status in ('proposed', 'active', 'rejected', 'disabled')),
  rule_type text not null default 'preauthorize' check (rule_type in ('preauthorize', 'pin', 'deprioritize', 'ignore')),
  source_scope text not null,
  opportunity_type text not null check (opportunity_type in ('job', 'internship', 'hackathon')),
  title text not null,
  description text not null,
  conditions jsonb not null default '{"min_score": 60, "min_confidence": 0.65}'::jsonb,
  allowed_action_types text[] not null default array['tracker_update', 'email_notification'],
  supporting_decision_ids uuid[] not null default array[]::uuid[],
  version integer not null default 1,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_standing_rules_lookup 
  on public.standing_rules(user_id, source_scope, opportunity_type, status);

alter table public.standing_rules enable row level security;

create policy "Users view own standing rules" on public.standing_rules
  for select to authenticated using (auth.uid() = user_id);

create policy "Users update own standing rules" on public.standing_rules
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users delete own standing rules" on public.standing_rules
  for delete to authenticated using (auth.uid() = user_id);

-- 3. Autonomy Ledger Table
create table if not exists public.autonomy_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  rule_id uuid references public.standing_rules(id) on delete set null,
  baseline_decision text not null check (baseline_decision in ('ACT', 'ASK', 'IGNORE')),
  effective_decision text not null check (effective_decision in ('ACT', 'ASK', 'IGNORE')),
  question_avoided boolean not null default false,
  is_override boolean not null default false,
  is_seeded boolean not null default false,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_autonomy_ledger_user 
  on public.autonomy_ledger(user_id, question_avoided, is_seeded);

alter table public.autonomy_ledger enable row level security;

create policy "Users view own autonomy ledger" on public.autonomy_ledger
  for select to authenticated using (auth.uid() = user_id);

-- 4. Record Student Decision RPC
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
  v_recent record;
  v_dec_count int := 0;
  v_all_same boolean := true;
  v_dec_ids uuid[] := array[]::uuid[];
  v_existing_rule uuid;
  v_rule_id uuid := null;
  v_rule_title text;
  v_rule_desc text;
  v_rule_type text;
  v_match public.matches%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;

  select * into v_opp from public.opportunities where id = p_opportunity_id and user_id = v_uid;
  if not found then
    return jsonb_build_object('error', 'OPPORTUNITY_NOT_FOUND');
  end if;

  -- Determine source scope (e.g., 'cred', 'meesho', 'devpost', or domain)
  v_scope := coalesce(nullif(lower(v_opp.source_badge), ''), nullif(lower(v_opp.organization), ''), 'general');

  -- Record explicit student decision
  insert into public.student_decisions(
    user_id, opportunity_id, opportunity_version, choice, reason, source_scope, opportunity_type, is_seeded
  ) values (
    v_uid, p_opportunity_id, 1, p_choice, p_reason, v_scope, v_opp.type, p_is_seeded
  ) returning id into v_decision_id;

  -- If decision overrides baseline, log to autonomy ledger
  select * into v_match from public.matches where opportunity_id = p_opportunity_id and user_id = v_uid;
  if found and v_match.decision is not null then
    if (p_choice in ('approve', 'pin') and v_match.decision <> 'ACT') or (p_choice = 'ignore' and v_match.decision <> 'IGNORE') then
      insert into public.autonomy_ledger(
        user_id, opportunity_id, rule_id, baseline_decision, effective_decision, question_avoided, is_override, is_seeded, reason
      ) values (
        v_uid, p_opportunity_id, null, v_match.decision,
        case when p_choice in ('approve', 'pin') then 'ACT' else 'IGNORE' end,
        false, true, p_is_seeded, 'Student manual override: ' || p_choice
      );
    end if;
  end if;

  -- Check last 3 decisions for this user, scope, opportunity_type, and is_seeded flag
  for v_recent in
    select id, choice from public.student_decisions
    where user_id = v_uid and source_scope = v_scope and opportunity_type = v_opp.type and is_seeded = p_is_seeded
    order by created_at desc
    limit 3
  loop
    v_dec_count := v_dec_count + 1;
    v_dec_ids := array_append(v_dec_ids, v_recent.id);
    if v_recent.choice <> p_choice then
      v_all_same := false;
    end if;
  end loop;

  -- If 3 consecutive consistent choices found, propose a standing rule
  if v_dec_count = 3 and v_all_same then
    -- Check if an active or proposed rule already exists for this scope and type
    select id into v_existing_rule from public.standing_rules
    where user_id = v_uid and source_scope = v_scope and opportunity_type = v_opp.type and status in ('proposed', 'active')
    limit 1;

    if v_existing_rule is null then
      v_rule_type := case when p_choice in ('approve', 'pin') then 'preauthorize' else 'ignore' end;
      v_rule_title := case 
        when p_choice in ('approve', 'pin') then 'Auto-track high-match ' || initcap(v_scope) || ' ' || initcap(v_opp.type) || 's'
        else 'Auto-ignore ' || initcap(v_scope) || ' ' || initcap(v_opp.type) || 's'
      end;
      v_rule_desc := case
        when p_choice in ('approve', 'pin') then 'Automatically track and notify for ' || initcap(v_scope) || ' ' || v_opp.type || ' opportunities with at least 60 score and 65% confidence without asking.'
        else 'Automatically ignore ' || initcap(v_scope) || ' ' || v_opp.type || ' opportunities.'
      end;

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

  return jsonb_build_object(
    'recorded', true,
    'decision_id', v_decision_id,
    'proposal_created', v_rule_id is not null,
    'rule_id', v_rule_id
  );
end; $$;

-- 5. Respond to Standing Rule RPC (Approve, Reject, Disable)
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

  select * into v_rule from public.standing_rules where id = p_rule_id and user_id = v_uid;
  if not found then return jsonb_build_object('error', 'RULE_NOT_FOUND'); end if;

  v_new_status := case 
    when p_action = 'approve' then 'active'
    when p_action = 'reject' then 'rejected'
    when p_action = 'disable' then 'disabled'
  end;

  update public.standing_rules
  set status = v_new_status,
      approved_at = case when p_action = 'approve' then now() else approved_at end,
      updated_at = now()
  where id = p_rule_id and user_id = v_uid;

  insert into public.events(user_id, stage, level, message, metadata)
  values (v_uid, 'rules', 'info', 'Standing rule ' || v_new_status || ': ' || v_rule.title, jsonb_build_object('rule_id', p_rule_id, 'new_status', v_new_status));

  return jsonb_build_object('success', true, 'rule_id', p_rule_id, 'status', v_new_status);
end; $$;

-- 6. Apply Standing Rule to Match RPC
create or replace function public.apply_standing_rule_to_match(
  p_match_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  m public.matches%rowtype;
  o public.opportunities%rowtype;
  r public.standing_rules%rowtype;
  v_scope text;
  v_min_score numeric := 60;
  v_min_conf numeric := 0.65;
  v_day_now date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select * into m from public.matches where id = p_match_id;
  if not found then return jsonb_build_object('applied', false, 'reason', 'MATCH_NOT_FOUND'); end if;
  select * into o from public.opportunities where id = m.opportunity_id and user_id = m.user_id;
  if not found then return jsonb_build_object('applied', false, 'reason', 'OPPORTUNITY_NOT_FOUND'); end if;

  -- Rules NEVER bypass hard gates
  if m.eligibility_status is distinct from 'ELIGIBLE' then
    return jsonb_build_object('applied', false, 'reason', 'INELIGIBLE_OR_UNKNOWN');
  end if;
  if o.deadline is not null and o.deadline <= v_day_now then
    return jsonb_build_object('applied', false, 'reason', 'EXPIRED');
  end if;
  if o.trust_tier = 'unverified' or (o.risk_signals is not null and array_length(o.risk_signals, 1) > 0) then
    return jsonb_build_object('applied', false, 'reason', 'UNVERIFIED_OR_RISK');
  end if;

  -- Only applies if baseline was ASK
  if m.decision <> 'ASK' then
    return jsonb_build_object('applied', false, 'reason', 'BASELINE_NOT_ASK');
  end if;

  v_scope := coalesce(nullif(lower(o.source_badge), ''), nullif(lower(o.organization), ''), 'general');

  -- Look for active rule matching scope and type
  select * into r from public.standing_rules
  where user_id = m.user_id and source_scope = v_scope and opportunity_type = o.type and status = 'active'
  order by updated_at desc limit 1;

  if not found then
    return jsonb_build_object('applied', false, 'reason', 'NO_MATCHING_RULE');
  end if;

  if r.rule_type = 'preauthorize' then
    v_min_score := coalesce((r.conditions->>'min_score')::numeric, 60);
    v_min_conf := coalesce((r.conditions->>'min_confidence')::numeric, 0.65);

    -- Check preauthorization floor (Decision D7)
    if m.match_score is null or m.match_score < v_min_score or m.confidence is null or m.confidence < v_min_conf then
      return jsonb_build_object('applied', false, 'reason', 'BELOW_RULE_FLOOR');
    end if;

    -- Preauthorization applies: upgrade ASK -> ACT
    update public.matches
    set decision = 'ACT',
        reason_codes = array_append(m.reason_codes, 'STANDING_RULE_PREAUTHORIZED'),
        updated_at = now()
    where id = m.id;

    -- Record in autonomy ledger: question avoided!
    insert into public.autonomy_ledger(
      user_id, opportunity_id, rule_id, baseline_decision, effective_decision, question_avoided, is_override, is_seeded, reason
    ) values (
      m.user_id, m.opportunity_id, r.id, 'ASK', 'ACT', true, false, false,
      'Preauthorized by standing rule: ' || r.title
    );

    -- Plan permitted actions
    perform public.worker_plan_actions(m.id);

    return jsonb_build_object('applied', true, 'rule_id', r.id, 'decision', 'ACT', 'question_avoided', true);

  elsif r.rule_type = 'ignore' then
    update public.matches
    set decision = 'IGNORE',
        reason_codes = array_append(m.reason_codes, 'STANDING_RULE_IGNORED'),
        updated_at = now()
    where id = m.id;

    insert into public.autonomy_ledger(
      user_id, opportunity_id, rule_id, baseline_decision, effective_decision, question_avoided, is_override, is_seeded, reason
    ) values (
      m.user_id, m.opportunity_id, r.id, 'ASK', 'IGNORE', true, false, false,
      'Ignored by standing rule: ' || r.title
    );

    return jsonb_build_object('applied', true, 'rule_id', r.id, 'decision', 'IGNORE', 'question_avoided', true);
  end if;

  return jsonb_build_object('applied', false, 'reason', 'UNSUPPORTED_RULE_TYPE');
end; $$;

-- 7. Get Home Autonomy Counter RPC
create or replace function public.get_home_counter() returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_read int := 0;
  v_ignored int := 0;
  v_acted int := 0;
  v_asked int := 0;
  v_avoided int := 0;
  v_active_rules int := 0;
  v_proposed_rules int := 0;
  v_seeded_read int := 0;
  v_seeded_avoided int := 0;
begin
  if v_uid is null then return jsonb_build_object('error', 'UNAUTHORIZED'); end if;

  -- Total items read / extracted
  select count(*) into v_read from public.opportunities where user_id = v_uid;
  select count(*) into v_seeded_read from public.raw_items where user_id = v_uid and (raw_content ilike '%DEMO DATA%' or raw_content ilike '%SETUP TEST%');

  -- Decisions breakdown
  select count(*) into v_ignored from public.matches where user_id = v_uid and decision = 'IGNORE';
  select count(*) into v_acted from public.matches where user_id = v_uid and decision = 'ACT';
  select count(*) into v_asked from public.matches where user_id = v_uid and decision = 'ASK';

  -- Questions avoided by standing rules
  select count(*) into v_avoided from public.autonomy_ledger where user_id = v_uid and question_avoided = true and is_seeded = false;
  select count(*) into v_seeded_avoided from public.autonomy_ledger where user_id = v_uid and question_avoided = true and is_seeded = true;

  -- Rules counts
  select count(*) into v_active_rules from public.standing_rules where user_id = v_uid and status = 'active';
  select count(*) into v_proposed_rules from public.standing_rules where user_id = v_uid and status = 'proposed';

  return jsonb_build_object(
    'items_read', v_read,
    'items_ignored', v_ignored,
    'items_acted', v_acted,
    'items_asked', v_asked,
    'questions_avoided', v_avoided,
    'active_rules', v_active_rules,
    'pending_proposals', v_proposed_rules,
    'breakdown', jsonb_build_object(
      'real', jsonb_build_object(
        'items_read', greatest(0, v_read - v_seeded_read),
        'questions_avoided', v_avoided
      ),
      'seeded', jsonb_build_object(
        'items_read', v_seeded_read,
        'questions_avoided', v_seeded_avoided
      )
    )
  );
end; $$;

-- 8. Grants
grant select, insert on public.student_decisions to authenticated;
grant select, update, delete on public.standing_rules to authenticated;
grant select on public.autonomy_ledger to authenticated;

grant execute on function public.record_student_decision(uuid, text, text, boolean) to authenticated;
grant execute on function public.respond_standing_rule(uuid, text) to authenticated;
grant execute on function public.apply_standing_rule_to_match(uuid) to service_role, authenticated;
grant execute on function public.get_home_counter() to authenticated;

commit;
