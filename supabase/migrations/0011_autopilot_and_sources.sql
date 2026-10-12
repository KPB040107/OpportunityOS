-- Slice 5: Autopilot, agent heartbeat, sources monitoring, and error handling.
begin;

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  url text not null,
  type text not null default 'page' check (type in ('page', 'rss', 'email_forward')),
  frequency text not null default 'daily' check (frequency in ('hourly', '6hours', 'daily', 'weekly')),
  enabled boolean not null default true,
  keywords text[] default '{}',
  last_scan_at timestamptz,
  last_status text default 'pending' check (last_status in ('pending', 'ok', 'error')),
  last_error text,
  item_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, id),
  unique(user_id, url)
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  ts timestamptz not null default now(),
  workflow text not null,
  status text not null default 'ok' check (status in ('running', 'ok', 'error')),
  items_processed int not null default 0,
  next_run_at timestamptz,
  error_message text,
  details jsonb default '{}'::jsonb
);

-- Indexes
create index if not exists idx_sources_user on public.sources(user_id, enabled);
create index if not exists idx_agent_runs_user_ts on public.agent_runs(user_id, ts desc);
create index if not exists idx_agent_runs_workflow on public.agent_runs(workflow, ts desc);

-- Enable RLS
alter table public.sources enable row level security;
alter table public.agent_runs enable row level security;

-- Revoke and grant service_role permissions
revoke all on public.sources, public.agent_runs from public, anon, authenticated;
grant all on public.sources, public.agent_runs to service_role;

-- Authenticated user permissions
grant select, insert, update, delete on public.sources to authenticated;
grant select on public.agent_runs to authenticated;

-- Policies
drop policy if exists sources_own on public.sources;
create policy sources_own on public.sources for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists agent_runs_own on public.agent_runs;
create policy agent_runs_own on public.agent_runs for select to authenticated
  using (user_id is null or (select auth.uid()) = user_id);

-- Atomic helper: record heartbeat and emit event
create or replace function public.record_agent_heartbeat(
  p_user uuid,
  p_workflow text,
  p_status text,
  p_items_processed int default 0,
  p_next_run_at timestamptz default null,
  p_error text default null,
  p_details jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_run_id uuid;
begin
  insert into public.agent_runs(user_id, workflow, status, items_processed, next_run_at, error_message, details)
  values(p_user, p_workflow, p_status, p_items_processed, p_next_run_at, p_error, p_details)
  returning id into v_run_id;

  if p_user is not null then
    insert into public.events(user_id, stage, level, message, metadata)
    values(
      p_user,
      'autopilot',
      case when p_status = 'error' then 'error' else 'info' end,
      format('Autopilot %s: %s (items: %s)', p_workflow, p_status, p_items_processed),
      jsonb_build_object('run_id', v_run_id, 'workflow', p_workflow, 'status', p_status, 'items', p_items_processed)
    );
  end if;

  return v_run_id;
end; $$;

-- Atomic helper: seed default preset sources for user
create or replace function public.seed_default_sources(p_user uuid)
returns int language plpgsql security definer set search_path='' as $$
declare
  v_count int := 0;
begin
  insert into public.sources(user_id, name, url, type, frequency, enabled, keywords)
  values
    (p_user, 'Unstop Opportunities', 'https://unstop.com/opportunities', 'page', 'daily', true, array['hackathon', 'internship']),
    (p_user, 'Devpost Hackathons', 'https://devpost.com/hackathons', 'page', 'daily', true, array['hackathon', 'coding']),
    (p_user, 'AICTE Internship Portal', 'https://internship.aicte-india.org', 'page', 'daily', false, array['internship', 'engineering']),
    (p_user, 'National Scholarship Portal', 'https://scholarships.gov.in', 'page', 'weekly', false, array['scholarship'])
  on conflict(user_id, url) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end; $$;

-- Atomic helper: query upcoming deadlines and due followups
drop function if exists public.get_upcoming_deadlines(uuid, int);
create or replace function public.get_upcoming_deadlines(
  p_user uuid,
  p_days int default 7
) returns table (
  application_id uuid,
  opportunity_id uuid,
  title text,
  organization text,
  deadline date,
  status text,
  days_remaining int
) language plpgsql security definer set search_path='' as $$
begin
  return query
  select
    a.id as application_id,
    o.id as opportunity_id,
    o.title,
    o.organization,
    o.deadline,
    a.status,
    (o.deadline - current_date)::int as days_remaining
  from public.applications a
  join public.opportunities o on o.id = a.opportunity_id and o.user_id = a.user_id
  where a.user_id = p_user
    and a.status in ('to_apply', 'saved', 'applied', 'interviewing')
    and o.deadline is not null
    and o.deadline >= current_date
    and o.deadline <= (current_date + p_days)
  order by o.deadline asc;
end; $$;

-- Atomic helper: claim and mark due followups
create or replace function public.claim_due_followups(
  p_user uuid
) returns table (
  followup_id uuid,
  application_id uuid,
  kind text,
  due_at timestamptz
) language plpgsql security definer set search_path='' as $$
begin
  return query
  update public.followups f
  set status = 'done'
  where f.user_id = p_user
    and f.status = 'pending'
    and f.due_at <= now()
  returning f.id, f.application_id, f.kind, f.due_at;
end; $$;

grant execute on function public.record_agent_heartbeat(uuid, text, text, int, timestamptz, text, jsonb) to authenticated, service_role;
grant execute on function public.seed_default_sources(uuid) to authenticated, service_role;
grant execute on function public.get_upcoming_deadlines(uuid, int) to authenticated, service_role;
grant execute on function public.claim_due_followups(uuid) to authenticated, service_role;

commit;
