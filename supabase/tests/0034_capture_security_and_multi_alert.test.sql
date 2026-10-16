-- Automated regression test for migration 0034: Capture Security and Forwarding Verification
-- Run within an isolated transaction that rolls back at the end.

begin;

do $$
declare
  u1 uuid := '11111111-1111-4111-8111-111111111111'::uuid;
  u2 uuid := '22222222-2222-4222-8222-222222222222'::uuid;
  v_alias1 text := '11111111111111111111111111111111';
  v_alias2 text := '22222222222222222222222222222222';
  v_req1 uuid := gen_random_uuid();
  v_req2 uuid := gen_random_uuid();
  v_cap_req uuid := gen_random_uuid();
  v_hash1 text := 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef';
  v_hash2 text := 'b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdefa1';
  v_res jsonb;
  v_nonce uuid;
  v_nonce2 uuid;
  v_redeem jsonb;
  v_profile1 public.profiles%rowtype;
  v_profile2 public.profiles%rowtype;
  v_event_count int;
begin
  -- Setup test users & profiles
  delete from public.profiles where user_id in (u1, u2);
  delete from auth.users where id in (u1, u2);

  insert into auth.users (id, email)
  values (u1, 'student1@example.com'), (u2, 'student2@example.com');

  insert into public.profiles (user_id, email_alias_token, display_name, degree, branch, career_goals)
  values (u1, v_alias1, 'Student One', 'B.Tech', 'CSE', 'Software engineering'),
         (u2, v_alias2, 'Student Two', 'B.Tech', 'ECE', 'Hardware engineering');

  -- Test 1: Privilege Verification
  -- Verify that 'authenticated' and 'anon' cannot execute verify_portal_alert
  if has_function_privilege('authenticated', 'public.verify_portal_alert(uuid, text)', 'execute') then
    raise exception 'SECURITY FAILURE: authenticated role still has execute privilege on verify_portal_alert';
  end if;
  if has_function_privilege('anon', 'public.verify_portal_alert(uuid, text)', 'execute') then
    raise exception 'SECURITY FAILURE: anon role still has execute privilege on verify_portal_alert';
  end if;
  if has_function_privilege('authenticated', 'public.detect_and_verify_portal_alert(uuid, text, text)', 'execute') then
    raise exception 'SECURITY FAILURE: authenticated role still has execute privilege on detect_and_verify_portal_alert';
  end if;

  -- Test 2: Generic email without authentic sender evidence
  -- Should mark forwarding_received = true, but verified_portals must stay empty
  v_res := public.worker_ingest_email(
    v_alias1,
    v_req1,
    'Hey, check out this job on linkedin.com! Role: Software Intern at TechCorp https://www.linkedin.com/jobs/view/999',
    jsonb_build_object('from_address', 'friend@gmail.com', 'subject', 'Fwd: job')
  );

  if not (v_res->>'accepted')::boolean or not (v_res->>'was_created')::boolean then
    raise exception 'FAILURE: worker_ingest_email rejected valid forward';
  end if;

  select * into v_profile1 from public.profiles where user_id = u1;
  if not v_profile1.forwarding_received then
    raise exception 'FAILURE: forwarding_received was not set on profile';
  end if;
  if 'linkedin' = any(v_profile1.verified_portals) then
    raise exception 'SECURITY FAILURE: generic message falsely granted verified LinkedIn badge';
  end if;

  -- Test 3: Attributable alert with authentic LinkedIn sender header
  v_res := public.worker_ingest_email(
    v_alias1,
    v_req2,
    'Your daily Job Alert: 2 new jobs matching Software Engineer Intern. View job: https://www.linkedin.com/jobs/view/1001',
    jsonb_build_object('from_address', 'jobalerts-noreply@linkedin.com', 'subject', 'Job Alert: Software Engineer Intern')
  );

  select * into v_profile1 from public.profiles where user_id = u1;
  if not ('linkedin' = any(v_profile1.verified_portals)) then
    raise exception 'FAILURE: authentic LinkedIn alert did not verify portal';
  end if;

  -- Check u2 profile did not change
  select * into v_profile2 from public.profiles where user_id = u2;
  if v_profile2.forwarding_received or cardinality(v_profile2.verified_portals) > 0 then
    raise exception 'SECURITY FAILURE: u2 profile was contaminated by u1 alert';
  end if;

  -- Test 4: Replay protection
  -- Sending same v_req2 again must return was_created: false and NOT duplicate events
  select count(*) into v_event_count from public.events where user_id = u1 and stage = 'intake';
  v_res := public.worker_ingest_email(
    v_alias1,
    v_req2,
    'Your daily Job Alert: 2 new jobs matching Software Engineer Intern. View job: https://www.linkedin.com/jobs/view/1001',
    jsonb_build_object('from_address', 'jobalerts-noreply@linkedin.com', 'subject', 'Job Alert: Software Engineer Intern')
  );

  if (v_res->>'was_created')::boolean then
    raise exception 'FAILURE: replay email was marked as created';
  end if;

  if (select count(*) from public.events where user_id = u1 and stage = 'intake') <> v_event_count then
    raise exception 'FAILURE: duplicate events emitted on replay';
  end if;

  -- Test 5: Capture nonce lifecycle with session binding
  -- Impersonate u1
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u1::text, 'role', 'authenticated')::text, true);

  v_res := public.issue_capture_nonce(v_cap_req, v_hash1);
  v_nonce := (v_res->>'nonce')::uuid;

  if v_nonce is null then
    raise exception 'FAILURE: issue_capture_nonce failed to return nonce';
  end if;

  -- 5a. Mismatched payload hash -> rejected
  v_redeem := public.redeem_capture_nonce(v_nonce, v_cap_req, v_hash2);
  if (v_redeem->>'valid')::boolean then
    raise exception 'SECURITY FAILURE: nonce accepted mismatched payload hash';
  end if;

  -- 5b. Mismatched request_id -> rejected
  v_redeem := public.redeem_capture_nonce(v_nonce, gen_random_uuid(), v_hash1);
  if (v_redeem->>'valid')::boolean then
    raise exception 'SECURITY FAILURE: nonce accepted mismatched request_id';
  end if;

  -- 5c. Valid redemption -> succeeds
  v_redeem := public.redeem_capture_nonce(v_nonce, v_cap_req, v_hash1);
  if not (v_redeem->>'valid')::boolean then
    raise exception 'FAILURE: valid nonce redemption rejected: %', v_redeem;
  end if;

  -- 5d. Replay (before item is in raw_items) -> rejected
  v_redeem := public.redeem_capture_nonce(v_nonce, v_cap_req, v_hash1);
  if (v_redeem->>'valid')::boolean then
    raise exception 'SECURITY FAILURE: nonce allowed replay';
  end if;
  if (v_redeem->>'error') <> 'NONCE_ALREADY_USED' then
    raise exception 'FAILURE: expected NONCE_ALREADY_USED, got %', v_redeem;
  end if;

  -- 5e. Cross-user isolation: Impersonate u2 and try to redeem u1's newly issued nonce
  v_res := public.issue_capture_nonce(gen_random_uuid(), v_hash1);
  v_nonce2 := (v_res->>'nonce')::uuid;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', u2::text, 'role', 'authenticated')::text, true);
  v_redeem := public.redeem_capture_nonce(v_nonce2, gen_random_uuid(), v_hash1);
  if (v_redeem->>'valid')::boolean then
    raise exception 'SECURITY FAILURE: u2 redeemed u1 nonce';
  end if;

  raise notice 'All 0034 Database Security Checks Passed Successfully!';
end;
$$;

rollback;
