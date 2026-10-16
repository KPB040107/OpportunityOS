-- Test 0035: Discovery volume control, user interactions, source preferences, and approval boundaries
begin;

do $$
declare
  v_u1 uuid := '11111111-1111-4111-8111-111111111111'::uuid;
  v_u2 uuid := '22222222-2222-4222-8222-222222222222'::uuid;
  v_opp1 uuid;
  v_opp2 uuid;
  v_match1 uuid;
  v_match2 uuid;
  v_appr1 uuid;
  v_run_id uuid := gen_random_uuid();
  v_lease_token uuid := gen_random_uuid();
  v_res jsonb;
  v_bool boolean;
begin
  -- Setup test users
  delete from public.user_opportunity_interactions where user_id in (v_u1, v_u2);
  delete from public.user_source_preferences where user_id in (v_u1, v_u2);
  delete from public.approvals where user_id in (v_u1, v_u2);
  delete from public.matches where user_id in (v_u1, v_u2);
  delete from public.opportunities where user_id in (v_u1, v_u2);
  delete from public.raw_items where user_id in (v_u1, v_u2);
  delete from public.profiles where user_id in (v_u1, v_u2);
  delete from auth.users where id in (v_u1, v_u2);

  insert into auth.users (id, email)
  values 
    (v_u1, 'student-u1@example.invalid'),
    (v_u2, 'student-u2@example.invalid');

  -- u1 is interested in internships; u2 is interested in jobs
  insert into public.profiles (user_id, email_alias_token, display_name, degree, branch, career_goals, interest_types)
  values 
    (v_u1, '11111111111111111111111111111111', 'Student One', 'B.Tech', 'CSE', 'Software Engineering Intern', ARRAY['internship']),
    (v_u2, '22222222222222222222222222222222', 'Student Two', 'B.Tech', 'CSE', 'Senior Architect', ARRAY['job']);

  -- 1. Test classify_seniority
  if public.classify_seniority('Associate Software Engineer') <> 'entry' then
    raise exception 'FAIL: Associate Software Engineer should be entry';
  end if;
  if public.classify_seniority('Associate Director, Data Science') <> 'executive' then
    raise exception 'FAIL: Associate Director should be executive';
  end if;
  if public.classify_seniority('Frontend Engineering Intern') <> 'intern' then
    raise exception 'FAIL: Frontend Engineering Intern should be intern';
  end if;
  if public.classify_seniority('Senior Engineering Manager') <> 'senior' then
    raise exception 'FAIL: Senior Engineering Manager should be senior';
  end if;

  -- 2. Test User Opportunity Interactions (Save / Hide)
  insert into public.opportunities (id, user_id, fingerprint, title, organization, type, extraction_confidence, extraction_version, extracted_json)
  values (gen_random_uuid(), v_u1, repeat('1', 64), 'Junior Dev', 'Acme', 'job', 0.9, 'extract-v1', '{}'::jsonb)
  returning id into v_opp1;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_u1::text, 'role', 'authenticated')::text, true);

  -- Toggle save
  v_bool := public.toggle_opportunity_save(v_opp1);
  if not v_bool then
    raise exception 'FAIL: toggle_opportunity_save should return true on first toggle';
  end if;
  if not exists (select 1 from public.user_opportunity_interactions where user_id = v_u1 and opportunity_id = v_opp1 and is_saved = true) then
    raise exception 'FAIL: is_saved should be true in table';
  end if;

  -- Toggle save again
  v_bool := public.toggle_opportunity_save(v_opp1);
  if v_bool then
    raise exception 'FAIL: toggle_opportunity_save should return false on second toggle';
  end if;

  -- Toggle hide
  v_bool := public.toggle_opportunity_hide(v_opp1);
  if not v_bool then
    raise exception 'FAIL: toggle_opportunity_hide should return true on first toggle';
  end if;

  -- 3. Test Source Preferences (Mute Source)
  v_res := public.set_source_preference('meesho', 'muted');
  if (v_res->>'preference') <> 'muted' then
    raise exception 'FAIL: set_source_preference failed to record preference';
  end if;
  if not exists (select 1 from public.user_source_preferences where user_id = v_u1 and source_identifier = 'meesho' and preference = 'muted') then
    raise exception 'FAIL: source_preference not in table';
  end if;

  -- 4. Test worker_create_approval boundary: UNKNOWN eligibility is rejected
  update public.matches
  set status = 'complete', decision = 'ASK', eligibility_status = 'UNKNOWN', match_score = 0, confidence = 0, explanation = 'No explicit requirements', reason_codes = ARRAY['UNKNOWN_ELIGIBILITY']
  where user_id = v_u1 and opportunity_id = v_opp1
  returning id into v_match1;

  -- Try creating approval for UNKNOWN match: MUST fail closed
  v_res := public.worker_create_approval(v_match1, '12345', 'http://localhost:5678/webhook-waiting/12345');
  if (v_res->>'created')::boolean then
    raise exception 'FAIL: worker_create_approval must reject UNKNOWN match';
  end if;
  if (v_res->>'reason') <> 'NON_ELIGIBLE_CANNOT_APPROVE' then
    raise exception 'FAIL: expected NON_ELIGIBLE_CANNOT_APPROVE, got %', (v_res->>'reason');
  end if;

  -- 5. Test worker_create_approval on ELIGIBLE match: MUST succeed
  insert into public.opportunities (id, user_id, fingerprint, title, organization, type, deadline, extraction_confidence, extraction_version, extracted_json)
  values (gen_random_uuid(), v_u1, repeat('2', 64), 'Eligible Role', 'BetaCorp', 'internship', null, 0.9, 'extract-v1', '{}'::jsonb)
  returning id into v_opp2;

  update public.matches
  set status = 'complete', decision = 'ASK', eligibility_status = 'ELIGIBLE', match_score = 75, confidence = 0.70, explanation = 'Eligible match below balanced mode score', reason_codes = ARRAY['BELOW_MODE_SCORE']
  where user_id = v_u1 and opportunity_id = v_opp2
  returning id into v_match2;

  v_res := public.worker_create_approval(v_match2, '99999', 'http://localhost:5678/webhook-waiting/99999');
  if not (v_res->>'created')::boolean then
    raise exception 'FAIL: worker_create_approval failed for eligible match: %', v_res;
  end if;
  v_appr1 := (v_res->>'approval_id')::uuid;

  -- 6. Test confirm_approval on eligible no-deadline opportunity under decision-v2
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_u1::text, 'role', 'authenticated')::text, true);
  v_res := public.confirm_approval(v_appr1, 1, 'approved', 'Looks good to me');
  if not (v_res->>'accepted')::boolean then
    raise exception 'FAIL: confirm_approval rejected eligible no-deadline approval: %', v_res;
  end if;

  raise notice 'Test 0035 passed cleanly!';
end;
$$;

rollback;
