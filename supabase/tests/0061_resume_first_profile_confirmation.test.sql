-- Confirming a resume draft can create the first profile without weakening
-- ownership, revision fencing, or replay protection. All rows roll back.
begin;
do $$
declare
  v_user uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_draft uuid;
  v_result jsonb;
begin
  insert into auth.users(id,email) values
    (v_user, 'resume-first-' || replace(v_user::text,'-','') || '@example.invalid'),
    (v_other, 'resume-other-' || replace(v_other::text,'-','') || '@example.invalid');
  insert into public.profile_drafts(user_id,base_profile_revision,proposed_fields,proposed_skills)
  values(v_user,0,'[{"field":"degree","value":"BTech"}]'::jsonb,'[{"name":"Python"}]'::jsonb)
  returning id into v_draft;

  perform set_config('request.jwt.claim.sub',v_other::text,true);
  begin
    perform public.confirm_profile_draft(v_draft,'{"degree":"BTech"}'::jsonb,'[]'::jsonb,0);
    raise exception 'Cross-user confirmation unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'DRAFT_NOT_FOUND:%' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub',v_user::text,true);
  begin
    perform public.confirm_profile_draft(v_draft,'{"degree":"BTech"}'::jsonb,'[]'::jsonb,1);
    raise exception 'Stale draft unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'OUTDATED_PROFILE_REVISION:%' then raise; end if;
  end;
  if exists(select 1 from public.profiles where user_id=v_user) then
    raise exception 'Rejected confirmation created a profile';
  end if;

  v_result:=public.confirm_profile_draft(v_draft,'{"degree":"BTech"}'::jsonb,
    '[{"name":"Python","level":"beginner"}]'::jsonb,0);
  if v_result->>'success' <> 'true' or (v_result->>'new_revision')::int <> 1 then
    raise exception 'First confirmation did not advance profile revision';
  end if;
  if not exists(select 1 from public.profiles where user_id=v_user and revision=1 and degree='BTech') then
    raise exception 'First profile was not saved';
  end if;
  if not exists(select 1 from public.profile_skills ps
    join public.skills s on s.id=ps.skill_id
    where ps.user_id=v_user and s.canonical_name='python' and ps.level='beginner') then
    raise exception 'First skill was not saved';
  end if;
  if not exists(select 1 from public.profile_drafts where id=v_draft and status='confirmed') then
    raise exception 'Draft did not become confirmed';
  end if;
  begin
    perform public.confirm_profile_draft(v_draft,'{}'::jsonb,'[]'::jsonb,0);
    raise exception 'Replay unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'DRAFT_NOT_ACTIONABLE:%' then raise; end if;
  end;
end $$;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_draft uuid;
  v_result jsonb;
begin
  insert into auth.users(id,email) values
    (v_user, 'resume-existing-' || replace(v_user::text,'-','') || '@example.invalid');
  insert into public.profiles(user_id,degree,revision) values(v_user,'BSc',1);
  insert into public.profile_drafts(user_id,base_profile_revision)
  values(v_user,1) returning id into v_draft;
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  v_result:=public.confirm_profile_draft(v_draft,'{"degree":"BTech"}'::jsonb,
    '[{"name":"Java","level":"advanced"}]'::jsonb,1);
  if (v_result->>'new_revision')::int <> 2 or not exists(
    select 1 from public.profiles where user_id=v_user and degree='BTech' and revision=2
  ) then raise exception 'Existing profile update regressed'; end if;
end $$;
select 'resume-first-profile-confirmation-pass' as result;
rollback;
