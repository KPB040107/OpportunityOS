-- ============================================================================
-- Migration 0038: Weekly Planner Safety, Save/Hide Ownership, and Discovery Pagination
-- ============================================================================

-- ============================================================================
-- 1. Reconcile Unsafe Existing Stored Plan Tasks (Repair 2)
-- Removes tasks linked to INELIGIBLE, UNKNOWN, or missing matches.
-- ============================================================================
delete from public.planned_tasks pt
where not exists (
  select 1 from public.matches m
  where m.opportunity_id = pt.opportunity_id
    and m.user_id = pt.user_id
    and m.eligibility_status = 'ELIGIBLE'
    and m.status = 'complete'
);

-- ============================================================================
-- 2. Update confirm_weekly_plan with strict eligibility and revision fence
-- ============================================================================
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
  v_profile record;
  v_item record;
  v_tasks_created integer := 0;
  v_opp record;
  v_match record;
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

  -- 3. Verify profile revision fence
  select * into v_profile
  from public.profiles
  where user_id = v_user_id;

  if v_profile.user_id is not null and v_plan.profile_revision is not null then
    if v_profile.revision <> v_plan.profile_revision then
      raise exception 'OUTDATED_PROFILE_REVISION: Profile has changed since draft was generated. Please regenerate your plan.';
    end if;
  end if;

  -- 4. Verify candidate eligibility, trust, ownership and deadline before confirming
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
      if v_item.opportunity_id is not null then
        -- Verify opportunity ownership and active deadline
        select o.id, o.title, o.organization, o.deadline, o.trust_tier into v_opp
        from public.opportunities o
        where o.id = v_item.opportunity_id and o.user_id = v_user_id;

        if v_opp.id is null then
          raise exception 'STALE_PLAN_CANDIDATE: Opportunity % does not exist or is not owned by user.', v_item.opportunity_id;
        end if;

        if v_opp.deadline is not null and v_opp.deadline < current_date then
          raise exception 'STALE_PLAN_CANDIDATE: Opportunity % deadline has passed.', v_item.opportunity_id;
        end if;

        if coalesce(v_opp.trust_tier, 'unverified') = 'unverified' then
          raise exception 'STALE_PLAN_CANDIDATE: Opportunity % is from an unverified source.', v_item.opportunity_id;
        end if;

        -- Verify complete and ELIGIBLE match
        select m.id, m.eligibility_status, m.status into v_match
        from public.matches m
        where m.opportunity_id = v_item.opportunity_id and m.user_id = v_user_id and m.status = 'complete';

        if v_match.id is null or v_match.eligibility_status <> 'ELIGIBLE' then
          raise exception 'STALE_PLAN_CANDIDATE: Opportunity % is no longer ELIGIBLE (current status: %).',
            v_item.opportunity_id, coalesce(v_match.eligibility_status, 'NO_MATCH');
        end if;
      end if;
    end loop;
  end if;

  -- 5. Supersede any previous confirmed plan for this week
  update public.weekly_plans
  set status = 'superseded'
  where user_id = v_user_id
    and plan_week_start = v_plan.plan_week_start
    and status = 'confirmed'
    and id <> p_plan_id;

  -- 6. Mark this plan confirmed
  update public.weekly_plans
  set status = 'confirmed', confirmed_at = now()
  where id = p_plan_id;

  -- 7. Insert scheduled tasks into public.planned_tasks
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
          status
        )
        values (
          v_user_id,
          p_plan_id,
          v_item.opportunity_id,
          coalesce(nullif(trim(v_item.title), ''), v_opp.title, 'Opportunity Task'),
          coalesce(nullif(trim(v_item.organization), ''), v_opp.organization, ''),
          v_opp.deadline,
          v_item.start_at,
          v_item.end_at,
          coalesce(v_item.duration_minutes, 30),
          'scheduled'
        )
        on conflict (user_id, plan_id, opportunity_id) do update set
          start_at = excluded.start_at,
          end_at = excluded.end_at,
          duration_minutes = excluded.duration_minutes;

        v_tasks_created := v_tasks_created + 1;
      end if;
    end loop;
  end if;

  -- 8. Log confirmation event in public.events
  insert into public.events (user_id, stage, level, message, metadata)
  values (
    v_user_id,
    'planner',
    'info',
    'Weekly plan confirmed',
    jsonb_build_object(
      'plan_id', p_plan_id,
      'tasks_created', v_tasks_created,
      'plan_week_start', v_plan.plan_week_start
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

grant execute on function public.confirm_weekly_plan(uuid, integer) to authenticated, service_role;

-- ============================================================================
-- 3. Enforce Ownership on Opportunity Save and Hide (Repair 4)
-- ============================================================================
create or replace function public.toggle_opportunity_save(p_opportunity_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_curr boolean;
  v_next boolean;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  -- Enforce that the student owns the opportunity being interacted with
  if not exists (select 1 from public.opportunities where id = p_opportunity_id and user_id = v_uid) then
    raise exception 'OPPORTUNITY_NOT_OWNED: Opportunity % not found or not owned by caller.', p_opportunity_id;
  end if;

  select is_saved into v_curr
  from public.user_opportunity_interactions
  where user_id = v_uid and opportunity_id = p_opportunity_id;

  v_next := not coalesce(v_curr, false);

  insert into public.user_opportunity_interactions(user_id, opportunity_id, is_saved, updated_at)
  values (v_uid, p_opportunity_id, v_next, now())
  on conflict (user_id, opportunity_id) do update set is_saved = v_next, updated_at = now();

  return v_next;
end;
$$;

create or replace function public.toggle_opportunity_hide(p_opportunity_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_curr boolean;
  v_next boolean;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  -- Enforce that the student owns the opportunity being interacted with
  if not exists (select 1 from public.opportunities where id = p_opportunity_id and user_id = v_uid) then
    raise exception 'OPPORTUNITY_NOT_OWNED: Opportunity % not found or not owned by caller.', p_opportunity_id;
  end if;

  select is_hidden into v_curr
  from public.user_opportunity_interactions
  where user_id = v_uid and opportunity_id = p_opportunity_id;

  v_next := not coalesce(v_curr, false);

  insert into public.user_opportunity_interactions(user_id, opportunity_id, is_hidden, updated_at)
  values (v_uid, p_opportunity_id, v_next, now())
  on conflict (user_id, opportunity_id) do update set is_hidden = v_next, updated_at = now();

  return v_next;
end;
$$;

grant execute on function public.toggle_opportunity_save(uuid) to authenticated, service_role;
grant execute on function public.toggle_opportunity_hide(uuid) to authenticated, service_role;

-- ============================================================================
-- 4. Discovery Pagination and Lease Support (Repair 3)
-- ============================================================================
alter table opportunityos_private.source_registry
  add column if not exists cursor_state jsonb not null default '{"offset": 0}'::jsonb;

create or replace function public.worker_claim_due_discovery()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r opportunityos_private.source_registry%rowtype;
  v_run_id uuid;
  v_lease_token uuid := gen_random_uuid();
begin
  select * into r
  from opportunityos_private.source_registry
  where status = 'active'
    and next_attempt <= now()
  order by next_attempt asc
  for update skip locked
  limit 1;

  if r.id is null then
    return jsonb_build_object('claimed', false);
  end if;

  insert into opportunityos_private.discovery_runs(
    source_id,
    adapter,
    lease_token,
    status
  )
  values (
    r.id,
    r.adapter,
    v_lease_token,
    'running'
  )
  returning id into v_run_id;

  update opportunityos_private.source_registry
  set next_attempt = now() + case
    when r.cadence = 'hourly' then interval '1 hour'
    when r.cadence = 'daily' then interval '1 day'
    else interval '1 day'
  end
  where id = r.id;

  return jsonb_build_object(
    'claimed', true,
    'run_id', v_run_id,
    'source_id', r.id,
    'name', r.name,
    'adapter', r.adapter,
    'config', r.config,
    'cursor_state', coalesce(r.cursor_state, '{"offset": 0}'::jsonb),
    'lease_token', v_lease_token
  );
end;
$$;

create or replace function public.worker_finish_discovery_run(
  p_run_id uuid,
  p_status text,
  p_found int,
  p_new int,
  p_updated int,
  p_error text default null,
  p_lease_token uuid default null,
  p_next_cursor jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
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
  where id = p_run_id
    and (p_lease_token is null or lease_token = p_lease_token)
  returning * into r;

  if r.id is null then
    return false;
  end if;

  if r.source_id is not null then
    update opportunityos_private.source_registry
    set last_successful_scan = case when p_status = 'ok' then now() else last_successful_scan end,
        item_count = item_count + coalesce(p_new, 0),
        error_count = case when p_status = 'error' then error_count + 1 else error_count end,
        last_error = p_error,
        cursor_state = coalesce(p_next_cursor, cursor_state),
        updated_at = now()
    where id = r.source_id;
  end if;

  return true;
end;
$$;

-- Overload for backwards compatibility with 6-arg callers
create or replace function public.worker_finish_discovery_run(
  p_run_id uuid,
  p_status text,
  p_found int,
  p_new int,
  p_updated int,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.worker_finish_discovery_run(p_run_id, p_status, p_found, p_new, p_updated, p_error, null, null);
end;
$$;

grant execute on function public.worker_claim_due_discovery() to service_role;
grant execute on function public.worker_finish_discovery_run(uuid, text, int, int, int, text, uuid, jsonb) to service_role;
grant execute on function public.worker_finish_discovery_run(uuid, text, int, int, int, text) to service_role;
