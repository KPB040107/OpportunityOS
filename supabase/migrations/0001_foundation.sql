-- Run in Supabase SQL Editor. Requires Supabase Auth and its auth schema.
begin;
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ts timestamptz not null default now(),
  stage text not null,
  level text not null check (level in ('info', 'warning', 'error')),
  message text not null,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists events_user_ts_idx on public.events(user_id, ts desc);
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
grant select on public.events to authenticated;
grant all on public.events to service_role;
drop policy if exists events_read_own on public.events;
create policy events_read_own on public.events for select to authenticated
  using ((select auth.uid()) = user_id);
-- Browser clients cannot forge activity; trusted workflows write events.
commit;
