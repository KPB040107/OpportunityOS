-- 0063_profile_projects_consents_and_ranking.sql
-- Implements Phase 2 & 3 database schema:
-- 1. profile_projects table with RLS
-- 2. profiles consent and experience fields
-- 3. confirm_profile_draft with projects and consents support
-- 4. get_opportunities_page with sorting, diversity caps, and type tabs

begin;

-- 1. Create profile_projects table
create table if not exists public.profile_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  title text not null,
  description text default '',
  technologies text[] default '{}',
  github_url text,
  dates text,
  source text check (source in ('resume', 'manual', 'github')) default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profile_projects enable row level security;

drop policy if exists profile_projects_user_isolation on public.profile_projects;
create policy profile_projects_user_isolation on public.profile_projects
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.profile_projects to authenticated;
grant all on public.profile_projects to service_role;

-- 2. Add consent and experience columns to profiles
alter table public.profiles
  add column if not exists email_notifications_enabled boolean default false,
  add column if not exists calendar_sync_enabled boolean default false,
  add column if not exists consent_recorded_at timestamptz,
  add column if not exists years_of_experience numeric;

-- 3. Update confirm_profile_draft to support projects and consents
create or replace function public.confirm_profile_draft(
  p_draft_id uuid,
  p_selected_fields jsonb,
  p_skills_with_levels jsonb,
  p_expected_revision integer,
  p_projects jsonb default '[]'::jsonb,
  p_consents jsonb default '{}'::jsonb
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
  v_proj jsonb;
  v_projects_added integer := 0;
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
    years_of_experience = case
      when p_selected_fields ? 'years_of_experience' and p_selected_fields->>'years_of_experience' is not null
      then (p_selected_fields->>'years_of_experience')::numeric
      else years_of_experience
    end,
    email_notifications_enabled = case
      when p_consents ? 'email_notifications_enabled' and p_consents->>'email_notifications_enabled' is not null
      then (p_consents->>'email_notifications_enabled')::boolean
      else email_notifications_enabled
    end,
    calendar_sync_enabled = case
      when p_consents ? 'calendar_sync_enabled' and p_consents->>'calendar_sync_enabled' is not null
      then (p_consents->>'calendar_sync_enabled')::boolean
      else calendar_sync_enabled
    end,
    consent_recorded_at = case
      when (p_consents ? 'email_notifications_enabled') or (p_consents ? 'calendar_sync_enabled')
      then now()
      else consent_recorded_at
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

  -- 5. Insert confirmed projects
  if p_projects is not null and jsonb_typeof(p_projects) = 'array' then
    for v_proj in select value from jsonb_array_elements(p_projects)
    loop
      if length(trim(coalesce(v_proj->>'title', ''))) > 0 then
        insert into public.profile_projects (
          user_id, title, description, technologies, github_url, dates, source
        ) values (
          v_user_id,
          trim(v_proj->>'title'),
          trim(coalesce(v_proj->>'description', '')),
          case when jsonb_typeof(v_proj->'technologies') = 'array'
               then array(select jsonb_array_elements_text(v_proj->'technologies'))
               else '{}'::text[] end,
          nullif(trim(coalesce(v_proj->>'github_url', '')), ''),
          nullif(trim(coalesce(v_proj->>'dates', '')), ''),
          coalesce(v_proj->>'source', 'resume')
        );
        v_projects_added := v_projects_added + 1;
      end if;
    end loop;
  end if;

  -- 6. Mark draft confirmed
  update public.profile_drafts
  set status = 'confirmed', confirmed_at = now()
  where id = p_draft_id;

  -- 7. Privacy retention: mark upload confirmed and scrub raw text
  if v_draft.resume_upload_id is not null then
    update public.resume_uploads
    set status = 'confirmed',
        deleted_at = now(),
        extracted_text = null,
        updated_at = now()
    where id = v_draft.resume_upload_id and user_id = v_user_id;
  end if;

  -- 8. Log confirmation event in public.events
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
      'skills_updated', v_skills_updated,
      'projects_added', v_projects_added
    )
  );

  return jsonb_build_object(
    'success', true,
    'draft_id', p_draft_id,
    'new_revision', v_new_revision,
    'skills_updated', v_skills_updated,
    'projects_added', v_projects_added
  );
end;
$$;

-- 4-arg overload for backwards compatibility
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
begin
  return public.confirm_profile_draft(
    p_draft_id, p_selected_fields, p_skills_with_levels, p_expected_revision, '[]'::jsonb, '{}'::jsonb
  );
end;
$$;

revoke all on function public.confirm_profile_draft(uuid, jsonb, jsonb, integer, jsonb, jsonb) from public, anon;
grant execute on function public.confirm_profile_draft(uuid, jsonb, jsonb, integer, jsonb, jsonb) to authenticated, service_role;

revoke all on function public.confirm_profile_draft(uuid, jsonb, jsonb, integer) from public, anon;
grant execute on function public.confirm_profile_draft(uuid, jsonb, jsonb, integer) to authenticated, service_role;

-- 4. Update get_opportunities_page for tabs, sorting, and application status
create or replace function public.get_opportunities_page(p_filters jsonb default '{}', p_limit int default 20, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  uid uuid := auth.uid();
  result jsonb;
  v_sort text := coalesce(p_filters->>'sort', 'best');
begin
  if uid is null then raise exception 'Unauthorized'; end if;

  with filtered as (
    select
      o.id, o.title, o.organization, o.type, o.location, o.deadline, o.application_url, o.skills,
      o.ambiguity_flags, o.trust_tier, o.source_badge, o.risk_signals, o.seniority_level, o.created_at,
      o.requirements_status,
      coalesce(i.is_saved, false) as is_saved,
      coalesce(i.is_hidden, false) as is_hidden,
      app.status as application_status,
      case when m.id is not null then jsonb_build_object(
        'id', m.id, 'decision', m.decision, 'eligibility_status', m.eligibility_status,
        'match_score', m.match_score, 'confidence', m.confidence, 'explanation', m.explanation,
        'reason_codes', m.reason_codes
      ) end as match,
      row_number() over(partition by lower(o.organization) order by m.match_score desc nulls last, o.created_at desc, o.id) as employer_rank,
      row_number() over(partition by lower(trim(coalesce(o.title, ''))), lower(trim(coalesce(o.organization, ''))), lower(trim(coalesce(o.location, ''))) order by case when coalesce(i.is_saved, false) then 0 else 1 end, case when m.status = 'complete' then 0 else 1 end, o.created_at, o.id) as duplicate_rank,
      m.match_score as sort_score
    from public.opportunities o
    left join public.profiles p on p.user_id = uid
    left join public.matches m on m.opportunity_id = o.id and m.user_id = uid
    left join public.user_opportunity_interactions i on i.opportunity_id = o.id and i.user_id = uid
    left join public.user_source_preferences s on s.user_id = uid and s.source_identifier = lower(o.organization)
    left join public.applications app on app.opportunity_id = o.id and app.user_id = uid
    where o.user_id = uid
      and (p_filters->>'hidden' = 'true' or not coalesce(i.is_hidden, false))
      and (coalesce(p_filters->>'saved', 'false') <> 'true' or coalesce(i.is_saved, false))
      and (coalesce(p_filters->>'employer', 'all') <> 'all' or coalesce(s.preference, 'normal') <> 'muted')
      and (coalesce(p_filters->>'type', 'all') = 'all' or o.type = p_filters->>'type')
      and (coalesce(p_filters->>'employer', 'all') = 'all' or lower(o.organization) = lower(p_filters->>'employer'))
      and (coalesce(p_filters->>'eligibility', 'all') = 'all' or coalesce(m.eligibility_status, 'UNKNOWN') = p_filters->>'eligibility')
      and (coalesce(p_filters->>'decision', 'all') = 'all' or m.decision = p_filters->>'decision')
      and (coalesce(p_filters->>'trust', 'all') = 'all' or o.trust_tier = lower(p_filters->>'trust'))
      and (coalesce(p_filters->>'deadline', 'all') = 'all' or (p_filters->>'deadline' = 'unknown' and o.deadline is null) or (p_filters->>'deadline' = 'upcoming' and o.deadline >= current_date))
      and (coalesce(p_filters->>'location', 'all') = 'all' or (p_filters->>'location' = 'remote' and o.location ilike '%remote%') or (p_filters->>'location' = 'onsite' and o.location not ilike '%remote%'))
      and (coalesce(trim(p_filters->>'q'), '') = '' or position(lower(trim(p_filters->>'q')) in lower(concat_ws(' ', o.title, o.organization, o.location, array_to_string(o.skills, ' ')))) > 0)
      and (coalesce(p_filters->>'field', 'all') = 'all' or public.profile_domain_matches(o.title, o.type, o.skills, p.branch, null))
      and (coalesce(p_filters->>'status', 'all') = 'all' or app.status = p_filters->>'status')
  ),
  deduplicated as (
    select * from filtered where duplicate_rank = 1
  ),
  page as (
    select * from deduplicated
    order by
      case when v_sort in ('best', 'best_match') and coalesce(p_filters->>'employer', 'all') = 'all' and employer_rank > 3 then 1 else 0 end,
      case when v_sort in ('best', 'best_match') then sort_score end desc nulls last,
      case when v_sort = 'newest' then created_at end desc nulls last,
      case when v_sort = 'deadline_soonest' then case when deadline is null then 1 else 0 end end asc,
      case when v_sort = 'deadline_soonest' then deadline end asc nulls last,
      created_at desc, id
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(page) - 'employer_rank' - 'sort_score' - 'duplicate_rank') from page), '[]'::jsonb),
    'total', (select count(*) from deduplicated),
    'employers', (select coalesce(jsonb_agg(name order by name), '[]'::jsonb) from (select distinct organization as name from public.opportunities where user_id = uid and organization is not null) names)
  ) into result;

  return result;
end $$;

revoke all on function public.get_opportunities_page(jsonb, int, int) from public, anon;
grant execute on function public.get_opportunities_page(jsonb, int, int) to authenticated;

commit;
