-- Rehearsal 3: 3 distinct decisions -> proposal -> approval -> scoped application -> ledger -> revocation
begin;

select set_config('opportunityos.test_user', gen_random_uuid()::text, true);

insert into auth.users(id, email)
values(current_setting('opportunityos.test_user')::uuid, 'rehearsal3-' || current_setting('opportunityos.test_user') || '@example.invalid');

insert into public.profiles(user_id, display_name)
values(current_setting('opportunityos.test_user')::uuid, 'Rehearsal 3 Student');

do $$
declare
  u uuid := current_setting('opportunityos.test_user')::uuid;
  opp1 uuid;
  opp2 uuid;
  opp3 uuid;
  opp_incoming uuid;
  m_incoming uuid;
  d1 jsonb;
  d2 jsonb;
  d3 jsonb;
  rule_rec record;
  respond_res jsonb;
  apply_res jsonb;
  ledger_rec record;
  revoke_res jsonb;
  apply_after_revoke jsonb;
begin
  -- 1. Create 3 distinct opportunities from same scope (lever / cred)
  insert into public.opportunities(user_id, fingerprint, title, organization, source_badge, type, deadline, extraction_confidence, extraction_version, extracted_json, trust_tier)
  values(u, repeat('1', 64), 'Frontend Intern', 'CRED', 'CRED Careers', 'internship', current_date + 10, 0.9, 'extract-v1', '{}'::jsonb, 'corroborated')
  returning id into opp1;

  insert into public.opportunities(user_id, fingerprint, title, organization, source_badge, type, deadline, extraction_confidence, extraction_version, extracted_json, trust_tier)
  values(u, repeat('2', 64), 'Backend Intern', 'CRED', 'CRED Careers', 'internship', current_date + 10, 0.9, 'extract-v1', '{}'::jsonb, 'corroborated')
  returning id into opp2;

  insert into public.opportunities(user_id, fingerprint, title, organization, source_badge, type, deadline, extraction_confidence, extraction_version, extracted_json, trust_tier)
  values(u, repeat('3', 64), 'Data Intern', 'CRED', 'CRED Careers', 'internship', current_date + 10, 0.9, 'extract-v1', '{}'::jsonb, 'corroborated')
  returning id into opp3;

  -- Authenticate as user
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- Record decision on Opp 1: approve
  d1 := public.record_student_decision(opp1, 'approve', 'Looks great');
  if (d1->>'rule_proposed')::boolean then raise exception 'Rule proposed too early on 1 decision'; end if;

  -- Record decision on Opp 2: approve
  d2 := public.record_student_decision(opp2, 'approve', 'Looks great');
  if (d2->>'rule_proposed')::boolean then raise exception 'Rule proposed too early on 2 decisions'; end if;

  -- Record decision on Opp 3: approve (3rd distinct opportunity!)
  d3 := public.record_student_decision(opp3, 'approve', 'Looks great');
  if not (d3->>'rule_proposed')::boolean then raise exception 'Rule was not proposed after 3 distinct approvals: %', d3; end if;

  -- 2. Verify standing rule was proposed
  select * into rule_rec from public.standing_rules where user_id = u and status = 'proposed' order by created_at desc limit 1;
  if not found then raise exception 'Proposed standing rule missing from database'; end if;
  if rule_rec.rule_type <> 'preauthorize' then raise exception 'Proposed rule type is not preauthorize: %', rule_rec.rule_type; end if;

  -- 3. Student Approves the Rule
  respond_res := public.respond_standing_rule(rule_rec.id, 'approve');
  if not (respond_res->>'success')::boolean or (respond_res->>'status') <> 'active' then
    raise exception 'Failed to activate standing rule: %', respond_res;
  end if;

  -- 4. Incoming 4th Opportunity with baseline ASK
  insert into public.opportunities(user_id, fingerprint, title, organization, source_badge, type, deadline, extraction_confidence, extraction_version, extracted_json, trust_tier)
  values(u, repeat('4', 64), 'Mobile Intern', 'CRED', 'CRED Careers', 'internship', current_date + 14, 0.9, 'extract-v1', '{}'::jsonb, 'corroborated')
  returning id into opp_incoming;

  update public.matches
  set revision = 1, status = 'complete', decision = 'ASK', eligibility_status = 'ELIGIBLE', evaluation_day = (now() at time zone 'Asia/Kolkata')::date, match_score = 76, confidence = 0.84
  where user_id = u and opportunity_id = opp_incoming
  returning id into m_incoming;

  -- Switch context to service_role to simulate worker applying rule
  perform set_config('request.jwt.claim.role', 'service_role', true);
  apply_res := public.apply_standing_rule_to_match(m_incoming);
  if not (apply_res->>'applied')::boolean or (apply_res->>'decision') <> 'ACT' then
    raise exception 'Active standing rule failed to preauthorize incoming ASK match: %', apply_res;
  end if;

  -- 5. Verify Autonomy Ledger entry: Question Avoided!
  select * into ledger_rec from public.autonomy_ledger where user_id = u and opportunity_id = opp_incoming;
  if not found then raise exception 'Autonomy ledger record missing'; end if;
  if not ledger_rec.question_avoided then raise exception 'Autonomy ledger question_avoided flag is false'; end if;
  if ledger_rec.effective_decision <> 'ACT' then raise exception 'Autonomy ledger effective_decision is not ACT'; end if;

  -- 6. Revoke / Disable Rule
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  revoke_res := public.respond_standing_rule(rule_rec.id, 'disable');
  if not (revoke_res->>'success')::boolean or (revoke_res->>'status') <> 'disabled' then
    raise exception 'Failed to disable standing rule: %', revoke_res;
  end if;

  -- 7. Reset match to ASK and test application: must NOT apply now
  update public.matches set decision = 'ASK' where id = m_incoming;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  apply_after_revoke := public.apply_standing_rule_to_match(m_incoming);
  if (apply_after_revoke->>'applied')::boolean then
    raise exception 'Disabled standing rule must not be applied';
  end if;

end;$$;

rollback;
select 'PASS: Rehearsal 3 - 3 distinct decisions -> proposal -> approval -> scoped application -> ledger -> revocation' as test_result;
