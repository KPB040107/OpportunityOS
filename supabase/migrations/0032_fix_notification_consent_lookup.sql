-- Migration 0032: Correct Notification Consent Column Lookup in worker_action_allowed
-- Fixes reference to public.profiles.notifications_enabled

begin;

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
    if not coalesce((select notifications_enabled from public.profiles where user_id = m.user_id), false) then
      return false;
    end if;
  end if;

  if m.eligibility_status is distinct from 'ELIGIBLE' or m.evaluation_day is distinct from day_now then
    return false;
  end if;

  select * into o from public.opportunities where id = m.opportunity_id and user_id = m.user_id;
  if not found then return false; end if;

  -- Tiered Source Trust Boundaries:
  -- unverified: blocked from autonomous actions
  if o.trust_tier = 'unverified' or (o.risk_signals is not null and array_length(o.risk_signals, 1) > 0) then
    return false;
  end if;

  -- attributed (unstructured/JSearch): internal tracker or notification only
  if o.trust_tier = 'attributed' and p_type not in ('tracker_update', 'email_notification') then
    return false;
  end if;

  -- No-deadline policy: eligible jobs/internships without deadlines may only update tracker & notify
  if o.deadline is null then
    if o.type in ('internship', 'job') and p_type in ('tracker_update', 'email_notification') then
      return m.decision = 'ACT' or exists(select 1 from public.approvals where match_id = m.id and match_revision = m.revision and status = 'approved' and expires_at > now());
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

  return m.decision = 'ACT' or exists(
    select 1 from public.approvals 
    where match_id = m.id and match_revision = m.revision and status = 'approved' and expires_at > now()
  );
end; $$;

commit;
