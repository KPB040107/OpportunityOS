-- Migration 0036: Slice S5 Resume Onboarding
-- Implements authenticated private resume upload tracking, profile drafts,
-- atomic draft confirmation with revision fencing, skill proficiency enforcement,
-- and D9 privacy data retention.

begin;

-- 1. Create resume_uploads table
create table if not exists public.resume_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  file_size integer not null check (file_size > 0 and file_size <= 5242880), -- 5 MiB cap
  file_sha256 text not null,
  status text not null default 'uploaded' check (
    status in ('uploaded', 'validating', 'extracting', 'draft_ready', 'confirmed', 'failed', 'deleted', 'expired')
  ),
  page_count integer check (page_count is null or (page_count > 0 and page_count <= 10)), -- 10 pages cap
  extracted_text text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_resume_uploads_user on public.resume_uploads(user_id, status);

alter table public.resume_uploads enable row level security;

drop policy if exists resume_uploads_owner_select on public.resume_uploads;
create policy resume_uploads_owner_select on public.resume_uploads
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists resume_uploads_owner_insert on public.resume_uploads;
create policy resume_uploads_owner_insert on public.resume_uploads
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists resume_uploads_owner_update on public.resume_uploads;
create policy resume_uploads_owner_update on public.resume_uploads
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.resume_uploads to authenticated;
grant all on public.resume_uploads to service_role;

-- 2. Create profile_drafts table
create table if not exists public.profile_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resume_upload_id uuid references public.resume_uploads(id) on delete set null,
  base_profile_revision integer not null,
  contract_version text not null default 'profile-draft-v1',
  proposed_fields jsonb not null default '[]'::jsonb,
  proposed_skills jsonb not null default '[]'::jsonb,
  missing_fields jsonb not null default '[]'::jsonb,
  status text not null default 'draft_ready' check (
    status in ('draft_ready', 'confirmed', 'discarded', 'expired')
  ),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index if not exists idx_profile_drafts_user on public.profile_drafts(user_id, status);

alter table public.profile_drafts enable row level security;

drop policy if exists profile_drafts_owner_select on public.profile_drafts;
create policy profile_drafts_owner_select on public.profile_drafts
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists profile_drafts_owner_insert on public.profile_drafts;
create policy profile_drafts_owner_insert on public.profile_drafts
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists profile_drafts_owner_update on public.profile_drafts;
create policy profile_drafts_owner_update on public.profile_drafts
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.profile_drafts to authenticated;
grant all on public.profile_drafts to service_role;

-- 3. Atomic Profile Draft Confirmation Function
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

  if v_profile.user_id is null then
    raise exception 'PROFILE_NOT_FOUND: User profile does not exist.';
  end if;

  if v_profile.revision <> p_expected_revision then
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

-- 4. Delete Resume Upload Function
create or replace function public.delete_resume_upload(p_upload_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: Authentication required.';
  end if;

  update public.resume_uploads
  set status = 'deleted',
      deleted_at = now(),
      extracted_text = null,
      updated_at = now()
  where id = p_upload_id and user_id = v_user_id;

  if not found then
    return false;
  end if;

  -- Discard associated drafts
  update public.profile_drafts
  set status = 'discarded'
  where resume_upload_id = p_upload_id and user_id = v_user_id and status = 'draft_ready';

  return true;
end;
$$;

revoke all on function public.delete_resume_upload(uuid) from public, anon;
grant execute on function public.delete_resume_upload(uuid) to authenticated, service_role;

commit;
