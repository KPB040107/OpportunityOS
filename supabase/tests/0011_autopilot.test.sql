-- Reversible test for Slice 5: Autopilot, sources, agent heartbeat, and RLS.
begin;

select set_config('opportunityos.auto_u1', gen_random_uuid()::text, true);
select set_config('opportunityos.auto_u2', gen_random_uuid()::text, true);

insert into auth.users(id, email) values
  (current_setting('opportunityos.auto_u1')::uuid, 'auto-u1-' || current_setting('opportunityos.auto_u1') || '@example.invalid'),
  (current_setting('opportunityos.auto_u2')::uuid, 'auto-u2-' || current_setting('opportunityos.auto_u2') || '@example.invalid');

insert into public.profiles(user_id, cgpa, graduation_year) values
  (current_setting('opportunityos.auto_u1')::uuid, 8.5, 2028),
  (current_setting('opportunityos.auto_u2')::uuid, 7.0, 2027);

do $$
declare
  u1 uuid := current_setting('opportunityos.auto_u1')::uuid;
  u2 uuid := current_setting('opportunityos.auto_u2')::uuid;
  v_seeded int;
  v_run_id uuid;
  v_source_count int;
  v_deadlines_count int;
  v_claimed_count int;
  v_opp uuid := gen_random_uuid();
  v_app uuid;
  v_followup uuid;
begin
  -- 1. Test seed_default_sources
  v_seeded := public.seed_default_sources(u1);
  if v_seeded <> 4 then
    raise exception 'Expected 4 seeded sources, got %', v_seeded;
  end if;

  -- Verify idempotent repeated seed
  v_seeded := public.seed_default_sources(u1);
  if v_seeded <> 0 then
    raise exception 'Expected 0 on duplicate seed, got %', v_seeded;
  end if;

  -- Verify sources count
  select count(*) into v_source_count from public.sources where user_id = u1;
  if v_source_count <> 4 then
    raise exception 'Expected 4 sources for user 1, got %', v_source_count;
  end if;

  -- 2. Test record_agent_heartbeat
  v_run_id := public.record_agent_heartbeat(
    u1,
    '06-autopilot',
    'ok',
    5,
    now() + interval '1 day',
    null,
    '{"test": true}'::jsonb
  );

  if not exists (select 1 from public.agent_runs where id = v_run_id and user_id = u1 and status = 'ok') then
    raise exception 'Agent run was not recorded properly';
  end if;

  if not exists (select 1 from public.events where user_id = u1 and stage = 'autopilot') then
    raise exception 'Heartbeat event was not logged in events table';
  end if;

  -- 3. Test upcoming deadlines & due followups
  -- Insert test opportunity for u1
  insert into public.opportunities(
    id, user_id, fingerprint, title, organization, deadline, location, type, application_url, extracted_json, extraction_confidence, extraction_version
  ) values (
    v_opp, u1, repeat('f', 64), 'Upcoming Internship', 'Test Org', current_date + 2, 'Remote', 'internship', 'https://example.com', '{"skills":[],"requirements":[]}'::jsonb, 0.9, 'extract-v1'
  );

  -- Insert application
  v_app := public.upsert_application_tracker(u1, v_opp, 'to_apply', 'Deadline test');

  -- Query upcoming deadlines (within 7 days)
  select count(*) into v_deadlines_count from public.get_upcoming_deadlines(u1, 7);
  if v_deadlines_count <> 1 then
    raise exception 'Expected 1 upcoming deadline, got %', v_deadlines_count;
  end if;

  -- Insert overdue followup
  insert into public.followups(user_id, application_id, due_at, kind, status)
  values (u1, v_app, now() - interval '1 hour', 'deadline_reminder', 'pending')
  returning id into v_followup;

  -- Claim due followups
  select count(*) into v_claimed_count from public.claim_due_followups(u1);
  if v_claimed_count <> 1 then
    raise exception 'Expected 1 claimed followup, got %', v_claimed_count;
  end if;

  if not exists (select 1 from public.followups where id = v_followup and status = 'done') then
    raise exception 'Followup was not marked done';
  end if;

  -- 4. Verify RLS cross-user isolation
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', u2::text)::text, true);

  if exists (select 1 from public.sources where user_id = u1) then
    raise exception 'RLS VIOLATION: u2 could read u1 sources';
  end if;

  if exists (select 1 from public.agent_runs where user_id = u1) then
    raise exception 'RLS VIOLATION: u2 could read u1 agent runs';
  end if;

  raise notice 'All Slice 5 database and RLS tests passed successfully.';
end $$;

rollback;
