-- Test 0036: Slice S5 Resume Onboarding
-- Tests RLS isolation, revision fencing, atomic profile confirmation,
-- user-set skill levels, and D9 data retention.

begin;

do $$
declare
  v_user_a uuid := '11111111-1111-4111-8111-111111111111';
  v_user_b uuid := '22222222-2222-4222-8222-222222222222';
  v_upload_id uuid;
  v_draft_id uuid;
  v_res jsonb;
  v_profile record;
  v_skill record;
  v_upload record;
begin
  -- 1. Setup test users and profiles
  delete from auth.users where id in (v_user_a, v_user_b);
  insert into auth.users (id, email) values (v_user_a, 'user_a_s5@test.local');
  insert into auth.users (id, email) values (v_user_b, 'user_b_s5@test.local');

  insert into public.profiles (user_id, display_name, revision)
  values (v_user_a, 'User A Original', 1)
  on conflict (user_id) do update set revision = 1, display_name = 'User A Original';

  insert into public.profiles (user_id, display_name, revision)
  values (v_user_b, 'User B Original', 1)
  on conflict (user_id) do update set revision = 1, display_name = 'User B Original';

  -- 2. Create upload and draft for User A
  insert into public.resume_uploads (
    user_id, storage_path, file_name, file_size, file_sha256, status, page_count, extracted_text
  )
  values (
    v_user_a, 'resumes/' || v_user_a || '/test.pdf', 'resume.pdf', 10240, 'sha256-hash-a', 'draft_ready', 2, 'B.Tech CS CGPA 9.2 Python React'
  )
  returning id into v_upload_id;

  insert into public.profile_drafts (
    user_id, resume_upload_id, base_profile_revision, proposed_fields, proposed_skills, missing_fields, status
  )
  values (
    v_user_a,
    v_upload_id,
    1,
    '[{"field": "degree", "value": "B.Tech", "state": "proposed", "evidence": {"page": 1, "quote": "B.Tech"}}, {"field": "cgpa", "value": 9.2, "state": "proposed", "evidence": {"page": 1, "quote": "9.2"}}]'::jsonb,
    '[{"name": "Python", "level": null, "state": "needs_confirmation", "evidence": {"page": 1, "quote": "Python"}}, {"name": "React", "level": null, "state": "needs_confirmation", "evidence": {"page": 1, "quote": "React"}}]'::jsonb,
    '["academic_year"]'::jsonb,
    'draft_ready'
  )
  returning id into v_draft_id;

  -- 3. Test RLS Isolation: User B cannot select User A's upload or draft
  execute 'set local role authenticated';
  execute 'set local request.jwt.claim.sub to ''' || v_user_b::text || '''';

  if exists (select 1 from public.resume_uploads where id = v_upload_id) then
    raise exception 'RLS_VIOLATION: User B can see User A resume upload!';
  end if;

  if exists (select 1 from public.profile_drafts where id = v_draft_id) then
    raise exception 'RLS_VIOLATION: User B can see User A profile draft!';
  end if;

  -- User B cannot confirm User A's draft
  begin
    perform public.confirm_profile_draft(
      v_draft_id,
      '{"degree": "Hacked"}'::jsonb,
      '[]'::jsonb,
      1
    );
    raise exception 'SECURITY_VIOLATION: User B was able to call confirm_profile_draft on User A draft!';
  exception when others then
    if sqlerrm not like '%DRAFT_NOT_FOUND%' then
      raise exception 'UNEXPECTED_ERROR: Expected DRAFT_NOT_FOUND, got: %', sqlerrm;
    end if;
  end;

  -- 4. Switch to User A context
  execute 'set local role authenticated';
  execute 'set local request.jwt.claim.sub to ''' || v_user_a::text || '''';

  -- User A can see their own upload & draft
  if not exists (select 1 from public.resume_uploads where id = v_upload_id) then
    raise exception 'RLS_ERROR: User A cannot see their own resume upload!';
  end if;

  -- Revision Fence Test: Wrong expected revision should raise OUTDATED_PROFILE_REVISION
  begin
    perform public.confirm_profile_draft(
      v_draft_id,
      '{"degree": "B.Tech"}'::jsonb,
      '[]'::jsonb,
      999 -- Wrong revision!
    );
    raise exception 'REVISION_FENCE_FAILED: Outdated revision did not raise exception!';
  exception when others then
    if sqlerrm not like '%OUTDATED_PROFILE_REVISION%' then
      raise exception 'UNEXPECTED_REVISION_ERROR: Expected OUTDATED_PROFILE_REVISION, got: %', sqlerrm;
    end if;
  end;

  -- Successful Confirmation Test
  v_res := public.confirm_profile_draft(
    v_draft_id,
    '{"degree": "B.Tech", "cgpa": 9.2}'::jsonb,
    '[{"name": "Python", "level": "advanced"}, {"name": "React", "level": "intermediate"}]'::jsonb,
    1 -- Matching expected revision
  );

  if (v_res->>'success')::boolean is not true then
    raise exception 'CONFIRM_FAILED: confirm_profile_draft returned unsuccessful.';
  end if;

  -- Verify Profile Updated
  select * into v_profile from public.profiles where user_id = v_user_a;
  if v_profile.degree <> 'B.Tech' or v_profile.cgpa <> 9.2 or v_profile.revision <> 2 then
    raise exception 'PROFILE_UPDATE_FAILED: Degree: %, CGPA: %, Revision: %',
      v_profile.degree, v_profile.cgpa, v_profile.revision;
  end if;

  -- Verify Skills Inserted
  select ps.level into v_skill
  from public.profile_skills ps
  join public.skills s on s.id = ps.skill_id
  where ps.user_id = v_user_a and s.canonical_name = 'python';

  if v_skill.level <> 'advanced' then
    raise exception 'SKILL_INSERT_FAILED: Python level is %, expected advanced', v_skill.level;
  end if;

  -- Verify Privacy Retention D9: extracted_text is scrubbed, deleted_at is set
  select * into v_upload from public.resume_uploads where id = v_upload_id;
  if v_upload.extracted_text is not null or v_upload.status <> 'confirmed' or v_upload.deleted_at is null then
    raise exception 'RETENTION_FAILED: Raw text not scrubbed or upload not marked deleted_at.';
  end if;

  -- Verify Draft marked confirmed and cannot be confirmed again
  begin
    perform public.confirm_profile_draft(
      v_draft_id,
      '{"degree": "Another"}'::jsonb,
      '[]'::jsonb,
      2
    );
    raise exception 'IDEMPOTENCY_FAILED: Confirmed draft was allowed to be re-confirmed!';
  exception when others then
    if sqlerrm not like '%DRAFT_NOT_ACTIONABLE%' then
      raise exception 'UNEXPECTED_DRAFT_STATUS_ERROR: Expected DRAFT_NOT_ACTIONABLE, got: %', sqlerrm;
    end if;
  end;

  -- Verify Event logged
  if not exists (
    select 1 from public.events
    where user_id = v_user_a and message = 'Profile draft confirmed'
  ) then
    raise exception 'EVENT_MISSING: Profile draft confirmed event was not emitted.';
  end if;

  raise notice 'Test 0036 PASSED: All RLS, revision fence, atomic updates, and retention rules verified.';
end $$;

rollback;
