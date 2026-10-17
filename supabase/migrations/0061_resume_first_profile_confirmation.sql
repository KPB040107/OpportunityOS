-- Allow first-time resume confirmation to create the owned profile atomically.
begin;
create or replace function public.confirm_profile_draft(
  p_draft_id uuid,
  p_selected_fields jsonb,
  p_skills_with_levels jsonb,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_draft record;
  v_profile record;
  v_new_revision integer;
  v_skill record;
  v_skill_name text;
  v_skill_level text;
  v_skill_id uuid;
  v_skills_updated integer := 0;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: Authentication required to confirm profile draft.';
  end if;

  -- 1. Fetch and validate draft ownership & status
  select * into v_draft
  from public.profile_drafts
  where id = p_draft_id and user_id = v_user_id;

  if v_draft.id is null then
    raise exception 'DRAFT_NOT_FOUND: Profile draft not found or owned by another user.';
  end if;

  if v_draft.status <> 'draft_ready' then
    raise exception 'DRAFT_NOT_ACTIONABLE: Draft is already % and cannot be confirmed.', v_draft.status;
  end if;

  -- 2. Fetch profile and verify revision fence
  select * into v_profile
  from public.profiles
  where user_id = v_user_id
  for update;

  if p_expected_revision is distinct from v_draft.base_profile_revision then
    raise exception 'OUTDATED_PROFILE_REVISION: Draft was extracted at revision %.', v_draft.base_profile_revision;
  end if;

  if v_profile.user_id is null then
    if p_expected_revision <> 0 then
      raise exception 'OUTDATED_PROFILE_REVISION: First profile draft must begin at revision 0.';
    end if;
    insert into public.profiles (user_id, revision)
    values (v_user_id, 0)
    on conflict (user_id) do nothing;
    select * into v_profile
    from public.profiles
    where user_id = v_user_id
    for update;
    if v_profile.user_id is null then
      raise exception 'PROFILE_NOT_FOUND: Could not create the student profile.';
    end if;
  end if;

  if v_profile.revision is distinct from p_expected_revision then
    raise exception 'OUTDATED_PROFILE_REVISION: Expected revision % but profile is at revision %.',
      p_expected_revision, v_profile.revision;
  end if;

  v_new_revision := v_profile.revision + 1;

  -- 3. Update public.profiles with selected fields
  update public.profiles
  set
    display_name = case 
      when p_selected_fields ? 'display_name' and p_selected_fields->>'display_name' is not null and trim(p_selected_fields->>'display_name') <> ''
      then trim(p_selected_fields->>'display_name')
      else display_name
    end,
    degree = case 
      when p_selected_fields ? 'degree' and p_selected_fields->>'degree' is not null and trim(p_selected_fields->>'degree') <> ''
      then trim(p_selected_fields->>'degree')
      else degree
    end,
    branch = case 
      when p_selected_fields ? 'branch' and p_selected_fields->>'branch' is not null and trim(p_selected_fields->>'branch') <> ''
      then trim(p_selected_fields->>'branch')
      else branch
    end,
    academic_year = case 
      when p_selected_fields ? 'academic_year' and p_selected_fields->>'academic_year' is not null
      then (p_selected_fields->>'academic_year')::integer
      else academic_year
    end,
    graduation_year = case 
      when p_selected_fields ? 'graduation_year' and p_selected_fields->>'graduation_year' is not null
      then (p_selected_fields->>'graduation_year')::integer
      else graduation_year
    end,
    cgpa = case 
      when p_selected_fields ? 'cgpa' and p_selected_fields->>'cgpa' is not null
      then (p_selected_fields->>'cgpa')::numeric
      else cgpa
    end,
    revision = v_new_revision,
    updated_at = now()
  where user_id = v_user_id;

  -- 4. Insert or update skills with explicit levels in skills and profile_skills
  if p_skills_with_levels is not null and jsonb_typeof(p_skills_with_levels) = 'array' then
    for v_skill in select * from jsonb_to_recordset(p_skills_with_levels) as x(name text, level text)
    loop
      v_skill_name := trim(coalesce(v_skill.name, ''));
      v_skill_level := lower(trim(coalesce(v_skill.level, '')));

      if v_skill_name <> '' and v_skill_level in ('beginner', 'intermediate', 'advanced') then
        insert into public.skills (name, canonical_name)
        values (v_skill_name, lower(v_skill_name))
        on conflict (canonical_name) do update set canonical_name = excluded.canonical_name
        returning id into v_skill_id;

        insert into public.profile_skills (user_id, skill_id, level)
        values (v_user_id, v_skill_id, v_skill_level)
        on conflict (user_id, skill_id)
        do update set level = excluded.level;

        v_skills_updated := v_skills_updated + 1;
      end if;
    end loop;
  end if;

  -- 5. Mark draft confirmed
  update public.profile_drafts
  set status = 'confirmed', confirmed_at = now()
  where id = p_draft_id;

  -- 6. Privacy retention D9: mark upload confirmed and scrub raw text
  if v_draft.resume_upload_id is not null then
    update public.resume_uploads
    set status = 'confirmed',
        deleted_at = now(),
        extracted_text = null,
        updated_at = now()
    where id = v_draft.resume_upload_id and user_id = v_user_id;
  end if;

  -- 7. Log confirmation event in public.events
  insert into public.events (user_id, stage, level, message, metadata)
  values (
    v_user_id,
    'profile',
    'info',
    'Profile draft confirmed',
    jsonb_build_object(
      'draft_id', p_draft_id,
      'old_revision', p_expected_revision,
      'new_revision', v_new_revision,
      'skills_updated', v_skills_updated
    )
  );

  return jsonb_build_object(
    'success', true,
    'draft_id', p_draft_id,
    'new_revision', v_new_revision,
    'skills_updated', v_skills_updated
  );
end;
$$;

revoke all on function public.confirm_profile_draft(uuid, jsonb, jsonb, integer) from public, anon;
grant execute on function public.confirm_profile_draft(uuid, jsonb, jsonb, integer) to authenticated, service_role;

commit;
