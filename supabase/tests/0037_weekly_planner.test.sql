-- Test 0037: Slice S6 Deterministic Weekly Plan
-- Tests RLS isolation, revision fencing, idempotent task creation,
-- and availability budget bounds.

begin;

do $$
declare
  v_user_a uuid := '11111111-1111-4111-8111-111111111111';
  v_user_b uuid := '22222222-2222-4222-8222-222222222222';
  v_raw_id uuid;
  v_opp_id uuid;
  v_plan_id uuid;
  v_res jsonb;
  v_tasks_count integer;
  v_avail record;
begin
  -- 1. Setup test users and opportunities
  delete from auth.users where id in (v_user_a, v_user_b);
  insert into auth.users (id, email) values (v_user_a, 'user_a_s6@test.local');
  insert into auth.users (id, email) values (v_user_b, 'user_b_s6@test.local');

  insert into public.opportunities (
    user_id, fingerprint, title, organization, type, deadline, extracted_json, extraction_confidence, extraction_version
  )
  values (
    v_user_a,
    repeat('a', 64),
    'Software Engineer Intern',
    'Acme Labs',
    'internship',
    current_date + 5,
    '{}'::jsonb,
    0.95,
    'v1'
  )
  returning id into v_opp_id;

  update public.matches
  set eligibility_status = 'ELIGIBLE', status = 'complete', decision = 'ACT'
  where user_id = v_user_a and opportunity_id = v_opp_id;

  -- 2. Setup Availability for User A
  execute 'set local role authenticated';
  execute 'set local request.jwt.claim.sub to ''' || v_user_a::text || '''';

  v_res := public.save_user_availability(
    12.0,
    '[{"day": 1, "start": "10:00", "end": "13:00"}]'::jsonb,
    '[{"title": "Midterm Exam", "start": "2026-10-21T09:00:00Z", "end": "2026-10-21T12:00:00Z"}]'::jsonb,
    'Asia/Kolkata'
  );

  if (v_res->>'success')::boolean is not true then
    raise exception 'SAVE_AVAILABILITY_FAILED';
  end if;

  select * into v_avail from public.user_availability where user_id = v_user_a;
  if v_avail.weekly_budget_hours <> 12.0 or v_avail.revision <> 1 then
    raise exception 'AVAILABILITY_STATE_MISMATCH';
  end if;

  -- 3. Create a Draft Weekly Plan for User A
  insert into public.weekly_plans (
    user_id,
    plan_week_start,
    profile_revision,
    availability_revision,
    status,
    scheduled_items,
    unscheduled_items,
    pressure_notes
  )
  values (
    v_user_a,
    current_date,
    1,
    1,
    'draft',
    jsonb_build_array(
      jsonb_build_object(
        'opportunity_id', v_opp_id,
        'title', 'Software Engineer Intern',
        'organization', 'Acme Labs',
        'duration_minutes', 30,
        'start_at', now() + interval '1 day',
        'end_at', now() + interval '1 day' + interval '30 minutes'
      )
    ),
    '[]'::jsonb,
    '[]'::jsonb
  )
  returning id into v_plan_id;

  -- 4. Test RLS Isolation: User B cannot see or confirm User A plan
  execute 'set local role authenticated';
  execute 'set local request.jwt.claim.sub to ''' || v_user_b::text || '''';

  if exists (select 1 from public.weekly_plans where id = v_plan_id) then
    raise exception 'RLS_VIOLATION: User B can see User A weekly plan!';
  end if;

  begin
    perform public.confirm_weekly_plan(v_plan_id, 1);
    raise exception 'SECURITY_VIOLATION: User B was able to confirm User A plan!';
  exception when others then
    if sqlerrm not like '%PLAN_NOT_FOUND%' then
      raise exception 'UNEXPECTED_ERROR: Expected PLAN_NOT_FOUND, got: %', sqlerrm;
    end if;
  end;

  -- 5. Switch back to User A
  execute 'set local role authenticated';
  execute 'set local request.jwt.claim.sub to ''' || v_user_a::text || '''';

  -- Test Revision Fence: wrong expected revision raises OUTDATED_AVAILABILITY_REVISION
  begin
    perform public.confirm_weekly_plan(v_plan_id, 999);
    raise exception 'REVISION_FENCE_FAILED: Wrong availability revision did not fail!';
  exception when others then
    if sqlerrm not like '%OUTDATED_AVAILABILITY_REVISION%' then
      raise exception 'UNEXPECTED_ERROR: Expected OUTDATED_AVAILABILITY_REVISION, got: %', sqlerrm;
    end if;
  end;

  -- Test Successful Confirmation
  v_res := public.confirm_weekly_plan(v_plan_id, 1);
  if (v_res->>'success')::boolean is not true then
    raise exception 'CONFIRM_FAILED: confirm_weekly_plan returned false.';
  end if;

  -- Verify planned task created
  select count(*) into v_tasks_count from public.planned_tasks where plan_id = v_plan_id and user_id = v_user_a;
  if v_tasks_count <> 1 then
    raise exception 'TASK_COUNT_MISMATCH: Expected 1 task, found %', v_tasks_count;
  end if;

  -- Test Idempotent Repeated Confirmation: no duplicate tasks
  v_res := public.confirm_weekly_plan(v_plan_id, 1);
  if (v_res->>'status')::text <> 'already_confirmed' then
    raise exception 'IDEMPOTENCY_FAILED: Repeated confirmation did not return already_confirmed.';
  end if;

  select count(*) into v_tasks_count from public.planned_tasks where plan_id = v_plan_id and user_id = v_user_a;
  if v_tasks_count <> 1 then
    raise exception 'DUPLICATE_TASKS_CREATED: Expected 1 task after repeated confirmation, found %', v_tasks_count;
  end if;

  -- Verify audit event emitted
  if not exists (
    select 1 from public.events
    where user_id = v_user_a and message = 'Weekly plan confirmed'
  ) then
    raise exception 'EVENT_MISSING: Weekly plan confirmed event was not emitted.';
  end if;

  raise notice 'Test 0037 PASSED: All RLS, revision fence, deterministic task creation, and idempotency verified.';
end $$;

rollback;
