-- Migration 0028: Notification Consent Enforcement and Per-User Autopilot Recovery
-- Implements Repair 2 from Hackathon S0-S3 Audit:
-- 1. Restore notification consent check in worker_action_allowed.
-- 2. Enforce per-user Autopilot recovery loop with concurrency isolation.
begin;

-- 1. worker_action_allowed with Notification Consent & Tiered Trust
create or replace function public.worker_action_allowed(
  p_match uuid,
  p_type text,
  p_revision bigint
) returns boolean language plpgsql security definer set search_path='' as $$
declare
  m public.matches%rowtype;
  o public.opportunities%rowtype;
  day_now date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select * into m from public.matches where id = p_match and revision = p_revision and status = 'complete';
  if not found then return false; end if;

  if p_type = 'error_notification' then return true; end if;

  if p_type = 'approval_notification' then
    -- Approval notifications require a pending, non-expired approval
    return exists(select 1 from public.approvals where match_id = m.id and match_revision = m.revision and status = 'pending' and expires_at > now());
  end if;

  -- Consent Guard: Opt-out must strictly prevent sending
  if p_type in ('email_notification', 'deadline_reminder', 'followup_notification') then
    if not exists(select 1 from public.notification_preferences np where np.user_id = m.user_id and np.email_enabled = true) then
      return false;
    end if;
  end if;

  if m.eligibility_status is distinct from 'ELIGIBLE' or m.evaluation_day is distinct from day_now then
    return false;
  end if;

  select * into o from public.opportunities where id = m.opportunity_id and user_id = m.user_id;
  if not found then return false; end if;

  -- Tiered Trust Guard: Unverified items hold for review; Attributed items take low-risk only
  if o.trust_tier = 'unverified' or (o.risk_signals is not null and array_length(o.risk_signals, 1) > 0) then
    return false;
  end if;
  if o.trust_tier = 'attributed' and p_type not in ('tracker_update', 'email_notification') then
    return false;
  end if;

  -- Opportunity has no stated deadline:
  if o.deadline is null then
    if o.type in ('internship', 'job') and p_type in ('tracker_update', 'email_notification') then
      return m.decision = 'ACT' or exists(select 1 from public.approvals where match_id = m.id and match_revision = m.revision and status = 'approved' and expires_at > now());
    end if;
    return false;
  end if;

  -- Opportunity has a stated deadline:
  if o.deadline <= day_now then return false; end if;

  if p_type in ('deadline_reminder', 'followup_notification') then
    return exists(
      select 1 from public.applications 
      where user_id = m.user_id and opportunity_id = m.opportunity_id 
        and status in ('saved', 'to_apply', 'applied', 'assessment', 'interview')
    );
  end if;

  return m.decision = 'ACT' or exists(select 1 from public.approvals where match_id = m.id and match_revision = m.revision and status = 'approved' and expires_at > now());
end; $$;

-- 2. Durable Per-User Autopilot Recovery Loop
create or replace function public.worker_check_and_run_autopilot(p_force boolean default false)
returns setof jsonb language plpgsql security definer set search_path='' as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_time time := (now() at time zone 'Asia/Kolkata')::time;
  u record;
  v_user_runs int;
  queued int;
  id uuid;
  r record;
  f record;
begin
  if not p_force and v_time < time '09:00' then
    return next jsonb_build_object(
      'status', 'not_due',
      'queued', 0,
      'today', v_today,
      'current_time_ist', v_time::text,
      'message', 'Daily scan scheduled for 09:00 Asia/Kolkata'
    );
    return;
  end if;

  for u in select user_id from public.profiles loop
    -- Check if this specific user already ran autopilot successfully today
    select count(*) into v_user_runs
    from public.agent_runs
    where user_id = u.user_id
      and workflow = '06-autopilot'
      and status = 'ok'
      and (ts at time zone 'Asia/Kolkata')::date = v_today;

    if not p_force and v_user_runs > 0 then
      continue;
    end if;

    queued := 0;

    -- Reminders for upcoming deadlines (1 to 7 days ahead)
    for r in select m.id, m.evaluation_day from public.matches m
             join public.applications a on a.user_id = m.user_id and a.opportunity_id = m.opportunity_id
             join public.opportunities o on o.user_id = a.user_id and o.id = a.opportunity_id
             where m.user_id = u.user_id
               and a.status in ('to_apply', 'saved', 'applied', 'assessment', 'interview')
               and o.deadline between v_today + 1 and v_today + 7 loop
      if r.evaluation_day is distinct from v_today then
        perform public.enqueue_evaluation(u.user_id, (select opportunity_id from public.matches where id = r.id));
        continue;
      end if;
      id := public.worker_queue_action(r.id, 'deadline_reminder', '{}'::jsonb, v_today::text);
      if id is not null then queued := queued + 1; end if;
    end loop;

    -- Reminders for pending due followups
    for f in select f1.id, m.id as match_id from public.followups f1
             join public.applications a on a.id = f1.application_id and a.user_id = f1.user_id
             join public.matches m on m.opportunity_id = a.opportunity_id and m.user_id = a.user_id
             where f1.user_id = u.user_id and f1.status = 'pending' and f1.due_at <= now() loop
      id := public.worker_queue_action(f.match_id, 'followup_notification', jsonb_build_object('followup_id', f.id), f.id::text);
      if id is not null then queued := queued + 1; end if;
    end loop;

    -- Record per-user heartbeat
    perform public.record_agent_heartbeat(
      u.user_id, '06-autopilot', 'ok', queued,
      ((v_today + 1) + time '09:00') at time zone 'Asia/Kolkata', null,
      jsonb_build_object('queued_actions', queued, 'delivery', 'See action results; queued is not delivered')
    );

    return next jsonb_build_object('user_id', u.user_id, 'status', 'ok', 'queued', queued);
  end loop;
end; $$;

revoke all on function public.worker_action_allowed(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.worker_action_allowed(uuid, text, bigint) to service_role;

revoke all on function public.worker_check_and_run_autopilot(boolean) from public, anon, authenticated;
grant execute on function public.worker_check_and_run_autopilot(boolean) to service_role;

commit;
