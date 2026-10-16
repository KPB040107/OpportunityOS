-- Migration 0037: Slice S6 Deterministic Weekly Plan
-- Implements user availability, deterministic weekly plans, scheduled planned tasks,
-- revision fencing, and audit events without external AI dependencies.

begin;

-- 1. Create user_availability table
create table if not exists public.user_availability (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weekly_budget_hours numeric(4,1) not null default 10.0 check (weekly_budget_hours between 1.0 and 60.0),
  working_windows jsonb not null default '[
    {"day": 1, "start": "09:00", "end": "12:00"},
    {"day": 2, "start": "09:00", "end": "12:00"},
    {"day": 3, "start": "09:00", "end": "12:00"},
    {"day": 4, "start": "09:00", "end": "12:00"},
    {"day": 5, "start": "09:00", "end": "12:00"}
  ]'::jsonb,
  busy_blocks jsonb not null default '[]'::jsonb,
  timezone text not null default 'Asia/Kolkata',
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.user_availability enable row level security;

drop policy if exists user_availability_owner_select on public.user_availability;
create policy user_availability_owner_select on public.user_availability
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_availability_owner_insert on public.user_availability;
create policy user_availability_owner_insert on public.user_availability
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_availability_owner_update on public.user_availability;
create policy user_availability_owner_update on public.user_availability
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.user_availability to authenticated;
grant all on public.user_availability to service_role;

-- 2. Create weekly_plans table
create table if not exists public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_week_start date not null,
  contract_version text not null default 'weekly-plan-v1',
  algorithm_version text not null default 'deadline-capacity-v1',
  profile_revision integer not null,
  availability_revision integer not null,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'discarded', 'superseded')),
  scheduled_items jsonb not null default '[]'::jsonb,
  unscheduled_items jsonb not null default '[]'::jsonb,
  pressure_notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index if not exists idx_weekly_plans_user_week on public.weekly_plans(user_id, plan_week_start, status);

alter table public.weekly_plans enable row level security;

drop policy if exists weekly_plans_owner_select on public.weekly_plans;
create policy weekly_plans_owner_select on public.weekly_plans
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists weekly_plans_owner_insert on public.weekly_plans;
create policy weekly_plans_owner_insert on public.weekly_plans
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists weekly_plans_owner_update on public.weekly_plans;
create policy weekly_plans_owner_update on public.weekly_plans
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.weekly_plans to authenticated;
grant all on public.weekly_plans to service_role;

-- 3. Create planned_tasks table
create table if not exists public.planned_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  title text not null,
  organization text not null default '',
  deadline timestamptz,
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_minutes integer not null default 30 check (duration_minutes between 15 and 240),
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  unique(user_id, plan_id, opportunity_id)
);

create index if not exists idx_planned_tasks_user_time on public.planned_tasks(user_id, start_at);

alter table public.planned_tasks enable row level security;

drop policy if exists planned_tasks_owner_select on public.planned_tasks;
create policy planned_tasks_owner_select on public.planned_tasks
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists planned_tasks_owner_insert on public.planned_tasks;
create policy planned_tasks_owner_insert on public.planned_tasks
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists planned_tasks_owner_update on public.planned_tasks;
create policy planned_tasks_owner_update on public.planned_tasks
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.planned_tasks to authenticated;
grant all on public.planned_tasks to service_role;

-- 4. RPC: Save User Availability
create or replace function public.save_user_availability(
  p_budget_hours numeric,
  p_working_windows jsonb,
  p_busy_blocks jsonb,
  p_timezone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_budget numeric := coalesce(p_budget_hours, 10.0);
  v_tz text := coalesce(nullif(trim(p_timezone), ''), 'Asia/Kolkata');
  v_new_revision integer;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: Authentication required to save availability.';
  end if;

  if v_budget < 1.0 or v_budget > 60.0 then
    raise exception 'INVALID_BUDGET: Weekly effort budget must be between 1.0 and 60.0 hours.';
  end if;

  insert into public.user_availability (
    user_id,
    weekly_budget_hours,
    working_windows,
    busy_blocks,
    timezone,
    revision,
    updated_at
  )
  values (
    v_user_id,
    v_budget,
    coalesce(p_working_windows, '[]'::jsonb),
    coalesce(p_busy_blocks, '[]'::jsonb),
    v_tz,
    1,
    now()
  )
  on conflict (user_id) do update set
    weekly_budget_hours = excluded.weekly_budget_hours,
    working_windows = excluded.working_windows,
    busy_blocks = excluded.busy_blocks,
    timezone = excluded.timezone,
    revision = public.user_availability.revision + 1,
    updated_at = now()
  returning revision into v_new_revision;

  return jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'revision', v_new_revision,
    'weekly_budget_hours', v_budget,
    'timezone', v_tz
  );
end;
$$;

revoke all on function public.save_user_availability(numeric, jsonb, jsonb, text) from public, anon;
grant execute on function public.save_user_availability(numeric, jsonb, jsonb, text) to authenticated, service_role;

-- 5. RPC: Confirm Weekly Plan
create or replace function public.confirm_weekly_plan(
  p_plan_id uuid,
  p_expected_availability_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan record;
  v_avail record;
  v_item record;
  v_tasks_created integer := 0;
  v_opp record;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: Authentication required to confirm weekly plan.';
  end if;

  -- 1. Fetch and validate plan ownership
  select * into v_plan
  from public.weekly_plans
  where id = p_plan_id and user_id = v_user_id;

  if v_plan.id is null then
    raise exception 'PLAN_NOT_FOUND: Weekly plan not found or owned by another user.';
  end if;

  if v_plan.status = 'confirmed' then
    -- Idempotent return: already confirmed
    return jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'status', 'already_confirmed',
      'tasks_created', 0
    );
  end if;

  if v_plan.status <> 'draft' then
    raise exception 'PLAN_NOT_ACTIONABLE: Plan is in status % and cannot be confirmed.', v_plan.status;
  end if;

  -- 2. Verify availability revision fence
  select * into v_avail
  from public.user_availability
  where user_id = v_user_id;

  if v_avail.user_id is not null and p_expected_availability_revision is not null then
    if v_avail.revision <> p_expected_availability_revision then
      raise exception 'OUTDATED_AVAILABILITY_REVISION: Expected availability revision % but current is %.',
        p_expected_availability_revision, v_avail.revision;
    end if;
  end if;

  -- 3. Supersede any previous confirmed plan for this week
  update public.weekly_plans
  set status = 'superseded'
  where user_id = v_user_id
    and plan_week_start = v_plan.plan_week_start
    and status = 'confirmed'
    and id <> p_plan_id;

  -- 4. Mark this plan confirmed
  update public.weekly_plans
  set status = 'confirmed', confirmed_at = now()
  where id = p_plan_id;

  -- 5. Insert scheduled tasks into public.planned_tasks
  if v_plan.scheduled_items is not null and jsonb_typeof(v_plan.scheduled_items) = 'array' then
    for v_item in select * from jsonb_to_recordset(v_plan.scheduled_items) as x(
      opportunity_id uuid,
      start_at timestamptz,
      end_at timestamptz,
      duration_minutes integer,
      title text,
      organization text
    )
    loop
      if v_item.opportunity_id is not null and v_item.start_at is not null and v_item.end_at is not null then
        -- Fetch opportunity facts if title/org missing
        select o.title, o.organization, o.deadline into v_opp
        from public.opportunities o
        where o.id = v_item.opportunity_id and o.user_id = v_user_id;

        insert into public.planned_tasks (
          user_id,
          plan_id,
          opportunity_id,
          title,
          organization,
          deadline,
          start_at,
          end_at,
          duration_minutes,
          status,
          created_at
        )
        values (
          v_user_id,
          p_plan_id,
          v_item.opportunity_id,
          coalesce(v_item.title, v_opp.title, 'Opportunity Preparation'),
          coalesce(v_item.organization, v_opp.organization, ''),
          v_opp.deadline,
          v_item.start_at,
          v_item.end_at,
          coalesce(v_item.duration_minutes, 30),
          'scheduled',
          now()
        )
        on conflict (user_id, plan_id, opportunity_id)
        do update set
          start_at = excluded.start_at,
          end_at = excluded.end_at,
          duration_minutes = excluded.duration_minutes;

        v_tasks_created := v_tasks_created + 1;
      end if;
    end loop;
  end if;

  -- 6. Log audit event
  insert into public.events (user_id, stage, level, message, metadata)
  values (
    v_user_id,
    'planner',
    'info',
    'Weekly plan confirmed',
    jsonb_build_object(
      'plan_id', p_plan_id,
      'plan_week_start', v_plan.plan_week_start,
      'tasks_scheduled', v_tasks_created
    )
  );

  return jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'status', 'confirmed',
    'tasks_created', v_tasks_created
  );
end;
$$;

revoke all on function public.confirm_weekly_plan(uuid, integer) from public, anon;
grant execute on function public.confirm_weekly_plan(uuid, integer) to authenticated, service_role;

commit;
