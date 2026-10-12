-- Tests for Slice 4: Act and Ask tables, idempotency, RLS, and approval resolution.
begin;

select set_config('opportunityos.act_a', gen_random_uuid()::text, true);
select set_config('opportunityos.act_b', gen_random_uuid()::text, true);

insert into auth.users(id, email) values
  (current_setting('opportunityos.act_a')::uuid, 'act-a-' || current_setting('opportunityos.act_a') || '@example.invalid'),
  (current_setting('opportunityos.act_b')::uuid, 'act-b-' || current_setting('opportunityos.act_b') || '@example.invalid');

insert into public.profiles(user_id, cgpa, graduation_year) values
  (current_setting('opportunityos.act_a')::uuid, 8.5, 2028),
  (current_setting('opportunityos.act_b')::uuid, 7.0, 2027);

insert into public.opportunities(user_id, fingerprint, title, type, extracted_json, extraction_confidence, extraction_version) values
  (current_setting('opportunityos.act_a')::uuid, repeat('a', 64), 'Opportunity A', 'internship', '{"skills":[],"requirements":[]}', 0.9, 'extract-v1'),
  (current_setting('opportunityos.act_b')::uuid, repeat('b', 64), 'Opportunity B', 'internship', '{"skills":[],"requirements":[]}', 0.9, 'extract-v1');

select set_config('opportunityos.opp_a', (select id::text from public.opportunities where user_id = current_setting('opportunityos.act_a')::uuid), true);
select set_config('opportunityos.opp_b', (select id::text from public.opportunities where user_id = current_setting('opportunityos.act_b')::uuid), true);

-- Update the auto-queued matches with test values
insert into public.matches(user_id, opportunity_id, decision, match_score, confidence, status) values
  (current_setting('opportunityos.act_a')::uuid, current_setting('opportunityos.opp_a')::uuid, 'ACT', 95, 0.9, 'complete'),
  (current_setting('opportunityos.act_b')::uuid, current_setting('opportunityos.opp_b')::uuid, 'ASK', 65, 0.8, 'complete')
on conflict(user_id, opportunity_id) do update set
  decision = excluded.decision,
  match_score = excluded.match_score,
  confidence = excluded.confidence,
  status = excluded.status;

select set_config('opportunityos.match_a', (select id::text from public.matches where user_id = current_setting('opportunityos.act_a')::uuid), true);
select set_config('opportunityos.match_b', (select id::text from public.matches where user_id = current_setting('opportunityos.act_b')::uuid), true);

do $$
declare
  a uuid := current_setting('opportunityos.act_a')::uuid;
  b uuid := current_setting('opportunityos.act_b')::uuid;
  opp_a uuid := current_setting('opportunityos.opp_a')::uuid;
  opp_b uuid := current_setting('opportunityos.opp_b')::uuid;
  match_a uuid := current_setting('opportunityos.match_a')::uuid;
  match_b uuid := current_setting('opportunityos.match_b')::uuid;
  res jsonb;
  app_id uuid;
  approval_id uuid;
  idemp_key text;
begin
  -- 1. Idempotency test (Test 9)
  idemp_key := a::text || ':' || match_a::text || ':calendar_event';
  res := public.claim_action(a, match_a, 'calendar_event', idemp_key);
  if not (res->>'claimed')::boolean or (res->>'is_duplicate')::boolean then
    raise exception 'Initial action claim failed';
  end if;

  -- Repeat exact same claim
  res := public.claim_action(a, match_a, 'calendar_event', idemp_key);
  if (res->>'claimed')::boolean or not (res->>'is_duplicate')::boolean then
    raise exception 'Duplicate action was not blocked by idempotency key';
  end if;

  -- Finish action
  perform public.finish_action(idemp_key, 'done', '{"event_id":"cal123"}'::jsonb, null);
  if (select status from public.actions where idempotency_key = idemp_key) <> 'done' then
    raise exception 'Action status not updated to done';
  end if;

  -- 2. Upsert application tracker
  app_id := public.upsert_application_tracker(a, opp_a, 'to_apply', 'Initial save');
  if (select status from public.applications where id = app_id) <> 'to_apply' then
    raise exception 'Application not tracked with initial status';
  end if;

  -- 3. Create approval request
  approval_id := public.create_approval_request(b, match_b, 'Deadline unknown in posting', array['deadline'], 'https://resume.example.com/test');
  if (select status from public.approvals where id = approval_id) <> 'pending' then
    raise exception 'Approval not created as pending';
  end if;

  -- 4. Followup creation
  insert into public.followups(user_id, application_id, due_at, kind)
  values(a, app_id, now() + interval '7 days', 'deadline_reminder');
end; $$;

-- 5. Test RLS isolation (Test 8)
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('opportunityos.act_b'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
begin
  -- User B cannot see User A's applications, actions, followups
  if exists (select 1 from public.applications where user_id = current_setting('opportunityos.act_a')::uuid) then
    raise exception 'Cross-user applications leaked';
  end if;
  if exists (select 1 from public.actions where user_id = current_setting('opportunityos.act_a')::uuid) then
    raise exception 'Cross-user actions leaked';
  end if;
  if exists (select 1 from public.followups where user_id = current_setting('opportunityos.act_a')::uuid) then
    raise exception 'Cross-user followups leaked';
  end if;

  -- User B can see their own approval
  if (select count(*) from public.approvals) <> 1 then
    raise exception 'Own approval not visible';
  end if;
end; $$;

reset role;

-- 6. Approval resolution flow
do $$
declare
  b uuid := current_setting('opportunityos.act_b')::uuid;
  approval_id uuid := (select id from public.approvals where user_id = b);
  res jsonb;
begin
  res := public.resolve_approval(approval_id, 'approved', 'User approved via link');
  if not (res->>'success')::boolean then
    raise exception 'Approval resolution failed';
  end if;

  if (select status from public.approvals where id = approval_id) <> 'approved' then
    raise exception 'Approval status not changed to approved';
  end if;

  if (select count(*) from public.applications where user_id = b) <> 1 then
    raise exception 'Approved opportunity not converted to application tracker';
  end if;

  if (select count(*) from public.user_feedback where user_id = b) <> 1 then
    raise exception 'User feedback was not recorded on approval';
  end if;
end; $$;

rollback;

select 'PASS: Slice 4 Act & Ask schema, idempotency, RLS, and approval resolution' as test_result;
