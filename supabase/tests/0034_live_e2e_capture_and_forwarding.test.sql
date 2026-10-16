-- End-to-end verification of S4 capture and multi-listing email forwarding
begin;

do $$
declare
  v_user_id uuid := '33333333-3333-4333-8333-333333333333'::uuid;
  v_alias text := '33333333333333333333333333333333';
  v_req1 uuid := gen_random_uuid();
  v_req2 uuid := gen_random_uuid();
  v_nonce uuid;
  v_nonce_res jsonb;
  v_redeem_res jsonb;
  v_hash text := 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  v_raw_id uuid;
  v_ingest_res jsonb;
  v_profile public.profiles%rowtype;
  v_raw_row public.raw_items%rowtype;
begin
  -- Setup isolated test user
  delete from public.profiles where user_id = v_user_id;
  delete from auth.users where id = v_user_id;

  insert into auth.users (id, email)
  values (v_user_id, 'student-s4-e2e@example.invalid');

  insert into public.profiles (user_id, email_alias_token, display_name, degree, branch, career_goals)
  values (v_user_id, v_alias, 'S4 E2E Student', 'B.Tech', 'CSE', 'Software engineering');

  -- 1. Signed-in Capture Flow
  -- Issue capture nonce bound to request_id and payload_hash
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user_id::text, 'role', 'authenticated')::text, true);

  v_nonce_res := public.issue_capture_nonce(v_req1, v_hash);
  v_nonce := (v_nonce_res->>'nonce')::uuid;

  if v_nonce is null then
    raise exception 'E2E FAIL: issue_capture_nonce did not return nonce';
  end if;

  -- Redeem nonce
  v_redeem_res := public.redeem_capture_nonce(v_nonce, v_req1, v_hash);
  if not (v_redeem_res->>'valid')::boolean then
    raise exception 'E2E FAIL: redeem_capture_nonce rejected valid nonce';
  end if;

  -- Ingest raw item with source_type = 'capture'
  select raw_item_id into v_raw_id from public.ingest_raw_item(
    v_user_id,
    v_req1,
    'capture',
    'Senior Frontend Engineer opportunity at Vercel. Work remotely building Next.js and frontend infrastructure.'
  );

  if v_raw_id is null then
    raise exception 'E2E FAIL: ingest_raw_item failed to create raw item';
  end if;

  -- Persist capture metadata
  update public.raw_items
  set metadata = jsonb_build_object(
    'title', 'Senior Frontend Engineer',
    'url', 'https://vercel.com/careers/senior-frontend',
    'candidate_url', 'https://vercel.com/careers/senior-frontend',
    'portal', 'web',
    'payload_hash', v_hash
  )
  where id = v_raw_id and user_id = v_user_id;

  -- Verify row in raw_items
  select * into v_raw_row from public.raw_items where id = v_raw_id and user_id = v_user_id;
  if v_raw_row.source_type <> 'capture' then
    raise exception 'E2E FAIL: raw_item source_type is not capture, got %', v_raw_row.source_type;
  end if;
  if v_raw_row.status <> 'queued' then
    raise exception 'E2E FAIL: raw_item status is not queued, got %', v_raw_row.status;
  end if;
  if (v_raw_row.metadata->>'title') <> 'Senior Frontend Engineer' then
    raise exception 'E2E FAIL: metadata title mismatch';
  end if;

  -- Verify safe idempotent retry: calling ingest_raw_item with same request_id returns existing row
  declare
    v_retry_res record;
  begin
    select * into v_retry_res from public.ingest_raw_item(
      v_user_id,
      v_req1,
      'capture',
      'Senior Frontend Engineer opportunity at Vercel. Work remotely building Next.js and frontend infrastructure.'
    );
    if v_retry_res.raw_item_id <> v_raw_id or v_retry_res.was_created <> false then
      raise exception 'E2E FAIL: idempotent retry did not return existing raw item';
    end if;
  end;

  -- 2. Email Forwarding with Authentic Sender
  v_ingest_res := public.worker_ingest_email(
    v_alias,
    v_req2,
    'Job Alert: 1 new job for Cloud Architect. View job: https://www.linkedin.com/jobs/view/98765',
    jsonb_build_object(
      'from_address', 'jobalerts-noreply@linkedin.com',
      'subject', 'Job Alert: Cloud Architect',
      'message_id', 'msg-e2e-linkedin-1'
    )
  );

  if not (v_ingest_res->>'accepted')::boolean or not (v_ingest_res->>'was_created')::boolean then
    raise exception 'E2E FAIL: worker_ingest_email rejected authentic LinkedIn alert';
  end if;

  select * into v_profile from public.profiles where user_id = v_user_id;
  if not v_profile.forwarding_received then
    raise exception 'E2E FAIL: profile.forwarding_received is not true';
  end if;
  if not ('linkedin' = any(v_profile.verified_portals)) then
    raise exception 'E2E FAIL: linkedin is not in verified_portals';
  end if;

  -- Verify private provenance record was created
  if not exists (
    select 1 from opportunityos_private.forwarded_email_provenance
    where user_id = v_user_id and message_id = 'msg-e2e-linkedin-1'
  ) then
    raise exception 'E2E FAIL: private provenance not recorded';
  end if;

  raise notice 'S4 End-to-End Live Verification Passed!';
end;
$$;

rollback;
