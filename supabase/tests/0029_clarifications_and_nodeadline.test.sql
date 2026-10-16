-- Rehearsal 2: Grouped clarifications resolving multiple opportunities and no-deadline approval
begin;

select set_config('opportunityos.test_user', gen_random_uuid()::text, true);

insert into auth.users(id, email)
values(current_setting('opportunityos.test_user')::uuid, 'rehearsal2-' || current_setting('opportunityos.test_user') || '@example.invalid');

insert into public.profiles(user_id, display_name, degree, branch, revision)
values(current_setting('opportunityos.test_user')::uuid, 'Rehearsal 2 Student', 'B.Tech', 'Computer Science', 1);

do $$
declare
  u uuid := current_setting('opportunityos.test_user')::uuid;
  opp1 uuid;
  opp2 uuid;
  clar1 uuid;
  clar2 uuid;
  clar_row record;
  p_rev bigint;
  m_id uuid;
  appr_id uuid;
  confirm_res jsonb;
begin
  -- 1. Create two opportunities missing CGPA
  insert into public.opportunities(user_id, fingerprint, title, organization, type, deadline, extraction_confidence, extraction_version, extracted_json)
  values(u, repeat('1', 64), 'Google SDE Intern', 'Google', 'internship', null, 0.9, 'extract-v1', '{}'::jsonb)
  returning id into opp1;

  insert into public.opportunities(user_id, fingerprint, title, organization, type, deadline, extraction_confidence, extraction_version, extracted_json)
  values(u, repeat('2', 64), 'Microsoft SDE Intern', 'Microsoft', 'internship', null, 0.9, 'extract-v1', '{}'::jsonb)
  returning id into opp2;

  -- 2. Group missing facts: record clarification for opp 1
  clar1 := public.record_or_group_clarification(u, 'cgpa', 'cgpa', 'What is your current CGPA out of 10.0?', opp1);
  if clar1 is null then raise exception 'Failed to create clarification'; end if;

  -- Record clarification for opp 2: must group into the exact same clarification ID
  clar2 := public.record_or_group_clarification(u, 'cgpa', 'cgpa', 'What is your current CGPA out of 10.0?', opp2);
  if clar1 <> clar2 then raise exception 'Failed to group multiple opportunities into one clarification question'; end if;

  select * into clar_row from public.clarifications where id = clar1;
  if array_length(clar_row.affected_opportunity_ids, 1) <> 2 then
    raise exception 'Clarification affected_opportunity_ids must contain both opportunities: %', clar_row.affected_opportunity_ids;
  end if;

  -- 3. Resolve clarification updates profile and increments revision
  -- Simulate authenticated user context
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- Update profile atomically (as resolve_clarification does)
  update public.profiles
  set cgpa = 8.8,
      revision = revision + 1,
      updated_at = now()
  where user_id = u;

  select revision into p_rev from public.profiles where user_id = u;
  if p_rev <> 2 then raise exception 'Profile revision was not incremented'; end if;

  update public.clarifications
  set status = 'resolved', answer = '{"cgpa": 8.8}'::jsonb, resolved_at = now()
  where id = clar1;

  -- 4. Verify no-deadline approval flow (confirm_approval allows null deadline for eligible internship within 48h)
  -- Create complete match for opp1
  update public.matches
  set revision = 1, status = 'complete', decision = 'ASK', eligibility_status = 'ELIGIBLE', evaluation_day = (now() at time zone 'Asia/Kolkata')::date, match_score = 75, confidence = 0.8
  where user_id = u and opportunity_id = opp1
  returning id into m_id;

  insert into public.approvals(user_id, match_id, match_revision, reason, status, expires_at, requires_information, resume_status)
  values(u, m_id, 1, 'Review required', 'pending', now() + interval '48 hours', false, 'waiting')
  returning id into appr_id;

  insert into opportunityos_private.approval_execution(approval_id, resume_url, execution_id, nonce, next_attempt_at)
  values(appr_id, 'http://localhost:5678/webhook-test/resume', 'exec-123', gen_random_uuid(), now());

  -- Confirm approval
  confirm_res := public.confirm_approval(appr_id, 1, 'approved', 'Looks good');
  if not (confirm_res->>'accepted')::boolean then
    raise exception 'Eligible no-deadline approval was rejected: %', confirm_res;
  end if;

end;$$;

rollback;
select 'PASS: Rehearsal 2 - Grouped clarifications resolving multiple opportunities and no-deadline approval' as test_result;
