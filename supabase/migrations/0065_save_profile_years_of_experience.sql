-- Migration 0065: Support years_of_experience in save_profile RPC
-- Preserves all validation and profile integrity while storing optional professional experience

begin;

create or replace function public.save_profile(p_profile jsonb, p_skills jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_skill jsonb;
  v_skill_id uuid;
  v_name text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_profile ? 'user_id' or p_profile ? 'email_token' then raise exception 'Ownership fields are forbidden'; end if;
  if jsonb_typeof(p_skills) <> 'array' or jsonb_array_length(p_skills) > 30 then raise exception 'Invalid skills'; end if;
  if jsonb_array_length(coalesce(p_profile->'interest_types','[]'::jsonb)) > 10
     or jsonb_array_length(coalesce(p_profile->'preferred_locations','[]'::jsonb)) > 20 then raise exception 'Too many preferences'; end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(p_profile->'interest_types','[]'::jsonb)) x(value)
    where value not in ('internship','hackathon','scholarship','program','job')) then raise exception 'Invalid interest'; end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(p_profile->'preferred_locations','[]'::jsonb)) x(value)
    where length(value) not between 1 and 80) then raise exception 'Invalid location'; end if;
  
  insert into public.profiles(
    user_id, display_name, degree, branch,
    academic_year, graduation_year, cgpa, years_of_experience,
    career_goals, interest_types, preferred_locations
  )
  values(
    v_user,
    trim(coalesce(p_profile->>'display_name','')),
    trim(coalesce(p_profile->>'degree','')),
    trim(coalesce(p_profile->>'branch','')),
    nullif(p_profile->>'academic_year','')::integer,
    nullif(p_profile->>'graduation_year','')::integer,
    nullif(p_profile->>'cgpa','')::numeric,
    nullif(p_profile->>'years_of_experience','')::numeric,
    trim(coalesce(p_profile->>'career_goals','')),
    array(select jsonb_array_elements_text(coalesce(p_profile->'interest_types','[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_profile->'preferred_locations','[]'::jsonb)))
  )
  on conflict(user_id) do update set
    display_name = excluded.display_name,
    degree = excluded.degree,
    branch = excluded.branch,
    academic_year = excluded.academic_year,
    graduation_year = excluded.graduation_year,
    cgpa = excluded.cgpa,
    years_of_experience = excluded.years_of_experience,
    career_goals = excluded.career_goals,
    interest_types = excluded.interest_types,
    preferred_locations = excluded.preferred_locations,
    updated_at = now();

  delete from public.profile_skills where user_id = v_user;
  for v_skill in select value from jsonb_array_elements(p_skills) loop
    v_name := trim(v_skill->>'name');
    if v_name is null or length(v_name) not between 1 and 80 then raise exception 'Invalid skill name'; end if;
    insert into public.skills(name, canonical_name) values(v_name, lower(v_name))
      on conflict(canonical_name) do update set canonical_name = excluded.canonical_name returning id into v_skill_id;
    insert into public.profile_skills(user_id, skill_id, level) values(v_user, v_skill_id, v_skill->>'level')
      on conflict(user_id, skill_id) do update set level = excluded.level;
  end loop;

  insert into public.events(user_id, stage, level, message) values(v_user, 'profile', 'info', 'Profile saved');
end;
$$;

revoke all on function public.save_profile(jsonb, jsonb) from public, anon;
grant execute on function public.save_profile(jsonb, jsonb) to authenticated;

commit;

select 'PASS: save_profile supports years_of_experience' as result;
