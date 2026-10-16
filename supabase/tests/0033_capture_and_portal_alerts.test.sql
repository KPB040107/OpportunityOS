-- Test Suite for Slice S4: Capture Nonces, Portal Alert Verification, and Ingest
begin;

select set_config('opportunityos.test_user', gen_random_uuid()::text, true);

insert into auth.users(id, email)
values(current_setting('opportunityos.test_user')::uuid, 's4test-' || current_setting('opportunityos.test_user') || '@example.invalid');

insert into public.profiles(user_id, display_name, email_alias_token)
values(current_setting('opportunityos.test_user')::uuid, 'S4 Test Candidate', replace(gen_random_uuid()::text, '-', ''));

do $$
declare
  u uuid := current_setting('opportunityos.test_user')::uuid;
  v_alias text;
  v_issue_res jsonb;
  v_nonce uuid;
  v_redeem_res jsonb;
  v_replay_res jsonb;
  v_forged_res jsonb;
  v_email_res jsonb;
  v_profile record;
  v_raw_id uuid;
  v_raw_res record;
begin
  select email_alias_token into v_alias from public.profiles where user_id = u;

  -- 1. Test Nonce Issuance as authenticated user
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_issue_res := public.issue_capture_nonce();
  if v_issue_res->>'nonce' is null then
    raise exception 'Failed to issue capture nonce: %', v_issue_res;
  end if;
  v_nonce := (v_issue_res->>'nonce')::uuid;

  -- 2. Test Nonce Redemption (Single-Use)
  v_redeem_res := public.redeem_capture_nonce(v_nonce);
  if not (v_redeem_res->>'valid')::boolean then
    raise exception 'Failed to redeem valid capture nonce: %', v_redeem_res;
  end if;

  -- 3. Test Replay Rejection
  v_replay_res := public.redeem_capture_nonce(v_nonce);
  if (v_replay_res->>'valid')::boolean or (v_replay_res->>'error') <> 'NONCE_ALREADY_USED' then
    raise exception 'Replay attack not prevented: %', v_replay_res;
  end if;

  -- 4. Test Forged Nonce Rejection
  v_forged_res := public.redeem_capture_nonce(gen_random_uuid());
  if (v_forged_res->>'valid')::boolean or (v_forged_res->>'error') <> 'NONCE_NOT_FOUND' then
    raise exception 'Forged nonce was not rejected: %', v_forged_res;
  end if;

  -- 5. Test Attributable Email Alert Ingest and Portal Verification
  perform set_config('request.jwt.claim.role', 'service_role', true);

  -- Generic spam message: should NOT verify any portal
  v_email_res := public.worker_ingest_email(
    v_alias,
    gen_random_uuid(),
    'Hello, check out this great job opportunity at an exciting new startup!'
  );
  if not (v_email_res->>'accepted')::boolean then
    raise exception 'Email ingest failed: %', v_email_res;
  end if;

  select * into v_profile from public.profiles where user_id = u;
  if array_length(v_profile.verified_portals, 1) > 0 then
    raise exception 'Generic message must not verify portal: %', v_profile.verified_portals;
  end if;

  -- Attributable LinkedIn Alert: should verify 'linkedin'
  v_email_res := public.worker_ingest_email(
    v_alias,
    gen_random_uuid(),
    'LinkedIn Job Alert: 5 new jobs matching Software Engineer Intern. View job at https://www.linkedin.com/jobs/view/999'
  );
  if not (v_email_res->>'accepted')::boolean then
    raise exception 'LinkedIn alert email ingest failed: %', v_email_res;
  end if;

  select * into v_profile from public.profiles where user_id = u;
  if not ('linkedin' = any(v_profile.verified_portals)) then
    raise exception 'LinkedIn portal was not verified from attributable alert: %', v_profile.verified_portals;
  end if;

  -- Attributable Unstop Alert: should verify 'unstop'
  v_email_res := public.worker_ingest_email(
    v_alias,
    gen_random_uuid(),
    'Unstop Opportunity Alert: Flipkart GRiD 6.0 Hackathon is now live on https://unstop.com/hackathons/flipkart'
  );
  select * into v_profile from public.profiles where user_id = u;
  if not ('unstop' = any(v_profile.verified_portals)) then
    raise exception 'Unstop portal was not verified from attributable alert: %', v_profile.verified_portals;
  end if;

  -- 6. Test Bookmarklet Capture Ingestion with source_type = 'capture'
  select * into v_raw_res from public.ingest_raw_item(
    u,
    gen_random_uuid(),
    'capture',
    'Title: SDE Intern\nSource: https://internshala.com/internship/detail/123\n\nLooking for Node.js developer.'
  );
  if v_raw_res.raw_item_id is null or not v_raw_res.was_created then
    raise exception 'Capture raw item ingest failed: %', v_raw_res;
  end if;

end;$$;

rollback;
select 'PASS: Slice S4 - Capture nonces, single-use security, portal alert verification, and raw capture ingest' as test_result;
