-- Slice 4: Act and Ask tables, idempotent execution records, and human-in-the-loop approvals.
begin;

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  opportunity_id uuid not null,
  status text not null default 'to_apply' check (status in ('saved','to_apply','applied','assessment','interview','offer','rejected')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, opportunity_id),
  unique(user_id, id),
  foreign key(user_id, opportunity_id) references public.opportunities(user_id, id) on delete cascade
);

create table if not exists public.actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  match_id uuid not null,
  type text not null check (type in ('calendar_event','email_notification','tracker_update','followup_schedule')),
  status text not null default 'pending' check (status in ('pending','done','failed')),
  idempotency_key text not null unique,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, id),
  foreign key(user_id, match_id) references public.matches(user_id, id) on delete cascade
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  match_id uuid not null,
  reason text not null,
  missing_info text[] default '{}',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  resume_url text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, match_id),
  unique(user_id, id),
  foreign key(user_id, match_id) references public.matches(user_id, id) on delete cascade
);

create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  application_id uuid not null,
  due_at timestamptz not null,
  kind text not null default 'deadline_reminder' check (kind in ('deadline_reminder','application_followup','prep_review')),
  status text not null default 'pending' check (status in ('pending','done','overdue')),
  created_at timestamptz not null default now(),
  unique(user_id, id),
  foreign key(user_id, application_id) references public.applications(user_id, id) on delete cascade
);

create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  match_id uuid not null,
  outcome text not null check (outcome in ('approved','rejected')),
  reason text,
  created_at timestamptz not null default now(),
  unique(user_id, id),
  foreign key(user_id, match_id) references public.matches(user_id, id) on delete cascade
);

-- Indexes for active queries
create index if not exists idx_applications_user_status on public.applications(user_id, status);
create index if not exists idx_approvals_user_status on public.approvals(user_id, status);
create index if not exists idx_followups_due on public.followups(user_id, status, due_at);
create index if not exists idx_actions_idempotency on public.actions(idempotency_key);

-- Enable RLS
alter table public.applications enable row level security;
alter table public.actions enable row level security;
alter table public.approvals enable row level security;
alter table public.followups enable row level security;
alter table public.user_feedback enable row level security;

-- Revoke and grant service_role permissions
revoke all on public.applications, public.actions, public.approvals, public.followups, public.user_feedback from public, anon, authenticated;
grant all on public.applications, public.actions, public.approvals, public.followups, public.user_feedback to service_role;

-- Authenticated user permissions
grant select on public.applications to authenticated;
grant select on public.actions to authenticated;
grant select on public.approvals to authenticated;
grant select on public.followups to authenticated;
grant select on public.user_feedback to authenticated;
grant update(status, notes, updated_at) on public.applications to authenticated;

-- Policies
create policy applications_own on public.applications for select to authenticated using ((select auth.uid()) = user_id);
create policy applications_update_own on public.applications for update to authenticated using ((select auth.uid()) = user_id);
create policy actions_own on public.actions for select to authenticated using ((select auth.uid()) = user_id);
create policy approvals_own on public.approvals for select to authenticated using ((select auth.uid()) = user_id);
create policy followups_own on public.followups for select to authenticated using ((select auth.uid()) = user_id);
create policy user_feedback_own on public.user_feedback for select to authenticated using ((select auth.uid()) = user_id);

-- Atomic helper: claim / record action with idempotency protection
create or replace function public.claim_action(
  p_user uuid,
  p_match uuid,
  p_type text,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_action_id uuid;
  v_existing_status text;
begin
  select id, status into v_action_id, v_existing_status from public.actions where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('claimed', false, 'action_id', v_action_id, 'status', v_existing_status, 'is_duplicate', true);
  end if;

  insert into public.actions(user_id, match_id, type, status, idempotency_key)
  values(p_user, p_match, p_type, 'pending', p_idempotency_key)
  returning id into v_action_id;

  return jsonb_build_object('claimed', true, 'action_id', v_action_id, 'status', 'pending', 'is_duplicate', false);
exception when unique_violation then
  select id, status into v_action_id, v_existing_status from public.actions where idempotency_key = p_idempotency_key;
  return jsonb_build_object('claimed', false, 'action_id', v_action_id, 'status', v_existing_status, 'is_duplicate', true);
end; $$;

-- Atomic helper: complete action
create or replace function public.finish_action(
  p_idempotency_key text,
  p_status text,
  p_result jsonb default null,
  p_error text default null
) returns void language plpgsql security definer set search_path='' as $$
begin
  update public.actions
  set status = p_status,
      result = p_result,
      error = p_error,
      updated_at = now()
  where idempotency_key = p_idempotency_key;
end; $$;

-- Atomic helper: upsert application in tracker
create or replace function public.upsert_application_tracker(
  p_user uuid,
  p_opportunity uuid,
  p_status text default 'to_apply',
  p_notes text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_app_id uuid;
begin
  insert into public.applications(user_id, opportunity_id, status, notes)
  values(p_user, p_opportunity, p_status, p_notes)
  on conflict(user_id, opportunity_id)
  do update set updated_at = now()
  returning id into v_app_id;

  return v_app_id;
end; $$;

-- Atomic helper: create approval request on ASK
create or replace function public.create_approval_request(
  p_user uuid,
  p_match uuid,
  p_reason text,
  p_missing_info text[] default '{}',
  p_resume_url text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_approval_id uuid;
begin
  insert into public.approvals(user_id, match_id, reason, missing_info, resume_url, status)
  values(p_user, p_match, p_reason, p_missing_info, p_resume_url, 'pending')
  on conflict(user_id, match_id)
  do update set reason = excluded.reason,
                missing_info = excluded.missing_info,
                resume_url = coalesce(excluded.resume_url, public.approvals.resume_url),
                updated_at = now()
  returning id into v_approval_id;

  return v_approval_id;
end; $$;

-- Atomic helper: resolve approval from Web UI or Resume webhook
create or replace function public.resolve_approval(
  p_approval_id uuid,
  p_outcome text,
  p_reason text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_user uuid;
  v_match uuid;
  v_opp uuid;
  v_prev_status text;
begin
  if (select auth.uid()) is not null then
    select user_id, match_id, status into v_user, v_match, v_prev_status
    from public.approvals
    where id = p_approval_id and user_id = (select auth.uid());
  else
    select user_id, match_id, status into v_user, v_match, v_prev_status
    from public.approvals
    where id = p_approval_id;
  end if;

  if not found then
    raise exception 'Approval not found';
  end if;

  if v_prev_status <> 'pending' then
    return jsonb_build_object('success', false, 'already_resolved', true, 'status', v_prev_status);
  end if;

  update public.approvals
  set status = p_outcome,
      decided_at = now(),
      updated_at = now()
  where id = p_approval_id;

  insert into public.user_feedback(user_id, match_id, outcome, reason)
  values(v_user, v_match, p_outcome, p_reason);

  if p_outcome = 'approved' then
    select opportunity_id into v_opp from public.matches where id = v_match;
    perform public.upsert_application_tracker(v_user, v_opp, 'to_apply', 'Approved from Approval Center');
  end if;

  return jsonb_build_object('success', true, 'status', p_outcome, 'user_id', v_user, 'match_id', v_match);
end; $$;

grant execute on function public.resolve_approval(uuid, text, text) to authenticated, service_role;

commit;
