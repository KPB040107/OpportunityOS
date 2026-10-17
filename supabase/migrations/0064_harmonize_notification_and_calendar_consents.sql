-- Migration 0064: Harmonize notification and calendar consents across action paths and queues
-- Ensures email_notifications_enabled and calendar_sync_enabled are strictly enforced in worker_match_context, worker_action_allowed, and queue functions.

begin;

-- 1. Synchronize any existing profile consent state
update public.profiles
set notifications_enabled = coalesce(email_notifications_enabled, notifications_enabled, false),
    email_notifications_enabled = coalesce(email_notifications_enabled, notifications_enabled, false),
    calendar_sync_enabled = coalesce(calendar_sync_enabled, false);

-- 2. Bi-directional trigger to keep notifications_enabled and email_notifications_enabled in lockstep
create or replace function public.sync_profile_notification_consents()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op = 'INSERT' then
    new.notifications_enabled := coalesce(new.email_notifications_enabled, new.notifications_enabled, false);
    new.email_notifications_enabled := new.notifications_enabled;
    new.calendar_sync_enabled := coalesce(new.calendar_sync_enabled, false);
  elsif tg_op = 'UPDATE' then
    if new.email_notifications_enabled is distinct from old.email_notifications_enabled then
      new.notifications_enabled := coalesce(new.email_notifications_enabled, false);
    elsif new.notifications_enabled is distinct from old.notifications_enabled then
      new.email_notifications_enabled := coalesce(new.notifications_enabled, false);
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_sync_profile_notification_consents on public.profiles;
create trigger trg_sync_profile_notification_consents
before insert or update on public.profiles
for each row execute function public.sync_profile_notification_consents();

-- 3. Update worker_match_context to respect both email and calendar consents
create or replace function public.worker_match_context(
  p_match uuid,
  p_execution text default null,
  p_workflow text default 'act'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  m public.matches%rowtype;
  o public.opportunities%rowtype;
  p public.profiles%rowtype;
  recipient text;
  demo boolean;
  email_opted_in boolean;
  calendar_opted_in boolean;
begin
  select * into m from public.matches where id = p_match and status = 'complete';
  if not found then return null; end if;

  select * into o from public.opportunities where id = m.opportunity_id and user_id = m.user_id;
  select * into p from public.profiles where user_id = m.user_id;

  if p_execution is not null then
    insert into opportunityos_private.execution_owners(execution_id, user_id, match_id, workflow)
    values(p_execution, m.user_id, m.id, p_workflow)
    on conflict do nothing;
  end if;

  demo := m.user_id::text = (select value from opportunityos_private.settings where key = 'demo_user_id');
  email_opted_in := coalesce(p.email_notifications_enabled, p.notifications_enabled, false);
  calendar_opted_in := coalesce(p.calendar_sync_enabled, false);

  select case when demo then (select value from opportunityos_private.settings where key = 'demo_email') else u.email end
  into recipient from auth.users u where u.id = m.user_id;

  return jsonb_build_object(
    'user_id', m.user_id,
    'match_id', m.id,
    'opportunity_id', o.id,
    'match', to_jsonb(m) - 'snapshot' - 'claim_token' - 'claimed_until' - 'cache_key',
    'opportunity', to_jsonb(o) - 'user_id',
    'recipient', recipient,
    'demo_calendar', (demo and calendar_opted_in),
    'calendar_sync_enabled', calendar_opted_in,
    'email_enabled', email_opted_in
  );
end; $$;

-- 4. Update worker_action_allowed to check email and calendar consents consistently
create or replace function public.worker_action_allowed(
  p_match uuid,
  p_type text,
  p_revision bigint
) returns boolean language plpgsql security definer set search_path='' as $$
declare
  m public.matches%rowtype;
  o public.opportunities%rowtype;
  p public.profiles%rowtype;
  day_now date := (now() at time zone 'Asia/Kolkata')::date;
  is_demo boolean;
begin
  select * into m from public.matches where id = p_match and revision = p_revision and status = 'complete';
  if not found then return false; end if;

  select * into p from public.profiles where user_id = m.user_id;
  is_demo := m.user_id::text = (select value from opportunityos_private.settings where key = 'demo_user_id');

  if p_type = 'error_notification' then return true; end if;

  if p_type = 'approval_notification' then
    return exists(
      select 1 from public.approvals
      where match_id = m.id and match_revision = m.revision and status = 'pending' and expires_at > now()
    );
  end if;

  -- Email Consent Guard
  if p_type in ('email_notification', 'deadline_reminder', 'followup_notification') then
    if not coalesce(p.email_notifications_enabled, p.notifications_enabled, false) then
      return false;
    end if;
  end if;

  -- Calendar Write Guard: only permitted for consented connected demo user; all others must use calendar_link
  if p_type = 'calendar_event' then
    if not (is_demo and coalesce(p.calendar_sync_enabled, false)) then
      return false;
    end if;
  end if;

  if m.eligibility_status is distinct from 'ELIGIBLE' or m.evaluation_day is distinct from day_now then
    return false;
  end if;

  select * into o from public.opportunities where id = m.opportunity_id and user_id = m.user_id;
  if not found then return false; end if;

  -- Tiered Source Trust Boundaries:
  if o.trust_tier = 'unverified' or (o.risk_signals is not null and array_length(o.risk_signals, 1) > 0) then
    return false;
  end if;

  if o.trust_tier = 'attributed' and p_type not in ('tracker_update', 'email_notification') then
    return false;
  end if;

  -- Missing deadline policy
  if o.deadline is null then
    if o.type in ('internship', 'job') and p_type in ('tracker_update', 'email_notification') then
      return m.decision = 'ACT' or exists(
        select 1 from public.approvals where match_id = m.id and match_revision = m.revision and status = 'approved' and expires_at > now()
      );
    end if;
    return false;
  end if;

  if o.deadline <= day_now then return false; end if;

  if p_type in ('deadline_reminder', 'followup_notification') then
    return exists(
      select 1 from public.applications
      where user_id = m.user_id and opportunity_id = m.opportunity_id and status in ('saved', 'to_apply', 'applied', 'assessment', 'interview')
    );
  end if;

  return coalesce(m.decision = 'ACT', false) or exists(
    select 1 from public.approvals where match_id = m.id and match_revision = m.revision and status = 'approved' and expires_at > now()
  );
end; $$;

-- 5. Updated RPC for calendar consent toggle with audit logging
create or replace function public.update_calendar_consent(p_enabled boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;

  update public.profiles
  set calendar_sync_enabled = p_enabled,
      updated_at = now()
  where user_id = v_uid;

  insert into public.events(user_id, stage, level, message, metadata)
  values(
    v_uid,
    'consent',
    'info',
    case when p_enabled then 'Google Calendar sync enabled' else 'Google Calendar sync revoked' end,
    jsonb_build_object('calendar_sync_enabled', p_enabled)
  );

  return jsonb_build_object('success', true, 'calendar_sync_enabled', p_enabled);
end; $$;

revoke all on function public.update_calendar_consent(boolean) from public, anon;
grant execute on function public.update_calendar_consent(boolean) to authenticated;

commit;

select 'PASS: Harmonized notification and calendar consents' as result;
