-- Additive Slice 1 schema. Run after 0001_foundation.sql.
begin;
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 100),
  degree text not null default '' check (length(degree) <= 100),
  branch text not null default '' check (length(branch) <= 100),
  academic_year integer check (academic_year between 1 and 8),
  graduation_year integer check (graduation_year between 2000 and 2100),
  cgpa numeric(4,2) check (cgpa between 0 and 10),
  career_goals text not null default '' check (length(career_goals) <= 2000),
  interest_types text[] not null default '{}',
  preferred_locations text[] not null default '{}',
  autonomy_mode text not null default 'balanced' check (autonomy_mode in ('cautious','balanced','autopilot')),
  timezone text not null default 'Asia/Kolkata',
  updated_at timestamptz not null default now()
);
create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  canonical_name text not null unique,
  aliases text[] not null default '{}'
);
create table if not exists public.profile_skills (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  skill_id uuid not null references public.skills(id),
  level text not null check (level in ('beginner','intermediate','advanced')),
  primary key (user_id,skill_id)
);
create table if not exists public.raw_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  source_type text not null check (source_type in ('text','url')),
  raw_content text not null check (length(raw_content) between 1 and 20000),
  status text not null default 'queued' check (status in ('queued','processing','understood','failed')),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,request_id)
);
create index if not exists raw_items_user_created_idx on public.raw_items(user_id,created_at desc);
alter table public.profiles enable row level security;
alter table public.skills enable row level security;
alter table public.profile_skills enable row level security;
alter table public.raw_items enable row level security;
revoke all on public.profiles,public.skills,public.profile_skills,public.raw_items from anon,authenticated;
grant select on public.profiles,public.skills,public.profile_skills,public.raw_items to authenticated;
grant all on public.profiles,public.skills,public.profile_skills,public.raw_items to service_role;
drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists profile_skills_read_own on public.profile_skills;
create policy profile_skills_read_own on public.profile_skills for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists skills_read on public.skills;
create policy skills_read on public.skills for select to authenticated using (true);
drop policy if exists raw_items_read_own on public.raw_items;
create policy raw_items_read_own on public.raw_items for select to authenticated using ((select auth.uid())=user_id);

-- Profile ownership is obtained inside the DB; clients cannot select another owner.
create or replace function public.save_profile(p_profile jsonb,p_skills jsonb)
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
  insert into public.profiles(user_id,display_name,degree,branch,academic_year,graduation_year,cgpa,career_goals,interest_types,preferred_locations)
  values(v_user,trim(coalesce(p_profile->>'display_name','')),trim(coalesce(p_profile->>'degree','')),trim(coalesce(p_profile->>'branch','')),
    nullif(p_profile->>'academic_year','')::integer,nullif(p_profile->>'graduation_year','')::integer,
    nullif(p_profile->>'cgpa','')::numeric,trim(coalesce(p_profile->>'career_goals','')),
    array(select jsonb_array_elements_text(coalesce(p_profile->'interest_types','[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_profile->'preferred_locations','[]'::jsonb))))
  on conflict(user_id) do update set display_name=excluded.display_name,degree=excluded.degree,branch=excluded.branch,
    academic_year=excluded.academic_year,graduation_year=excluded.graduation_year,cgpa=excluded.cgpa,
    career_goals=excluded.career_goals,interest_types=excluded.interest_types,preferred_locations=excluded.preferred_locations,updated_at=now();
  delete from public.profile_skills where user_id=v_user;
  for v_skill in select value from jsonb_array_elements(p_skills) loop
    v_name := trim(v_skill->>'name');
    if v_name is null or length(v_name) not between 1 and 80 then raise exception 'Invalid skill name'; end if;
    insert into public.skills(name,canonical_name) values(v_name,lower(v_name))
      on conflict(canonical_name) do update set canonical_name=excluded.canonical_name returning id into v_skill_id;
    insert into public.profile_skills(user_id,skill_id,level) values(v_user,v_skill_id,v_skill->>'level')
      on conflict(user_id,skill_id) do update set level=excluded.level;
  end loop;
  insert into public.events(user_id,stage,level,message) values(v_user,'profile','info','Profile saved');
end;
$$;
revoke all on function public.save_profile(jsonb,jsonb) from public,anon;
grant execute on function public.save_profile(jsonb,jsonb) to authenticated;

-- n8n calls this only after Supabase Auth verifies the request's access token.
-- A unique request ID makes uncertain retries safe, even in concurrent executions.
create or replace function public.ingest_raw_item(p_user_id uuid,p_request_id uuid,p_source_type text,p_content text)
returns table(raw_item_id uuid,processing_status text,was_created boolean)
language plpgsql set search_path = '' as $$
declare v_id uuid; v_existing public.raw_items%rowtype;
begin
  if p_user_id is null or p_request_id is null then raise exception 'Identifiers required'; end if;
  if p_source_type not in ('text','url') or p_source_type is null
    or p_content is null or length(trim(p_content)) not between 1 and 20000 then raise exception 'Invalid intake'; end if;
  insert into public.raw_items(user_id,request_id,source_type,raw_content)
    values(p_user_id,p_request_id,p_source_type,p_content)
    on conflict(user_id,request_id) do nothing returning id into v_id;
  if v_id is not null then
    insert into public.events(user_id,stage,level,message,metadata)
      values(p_user_id,'ingest','info','Opportunity saved',jsonb_build_object('raw_item_id',v_id,'source_type',p_source_type));
    return query select v_id,'queued'::text,true;
  else
    select * into strict v_existing from public.raw_items where user_id=p_user_id and request_id=p_request_id;
    if v_existing.raw_content <> p_content or v_existing.source_type <> p_source_type then
      raise exception 'Request identifier already used for different content';
    end if;
    return query select v_existing.id,v_existing.status,false;
  end if;
end;
$$;
revoke all on function public.ingest_raw_item(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ingest_raw_item(uuid,uuid,text,text) to service_role;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='events') then
    alter publication supabase_realtime add table public.events;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='raw_items') then
    alter publication supabase_realtime add table public.raw_items;
  end if;
end; $$;
commit;
