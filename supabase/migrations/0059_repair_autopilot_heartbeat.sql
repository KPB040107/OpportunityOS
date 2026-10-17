-- A deadline candidate with a stale evaluation stopped the entire daily scan:
-- the unqualified id in a nested SELECT collided with the PL/pgSQL id variable.
-- Carry the opportunity ID with the candidate and use explicitly named variables.
begin;

create or replace function public.worker_check_and_run_autopilot(p_force boolean default false)
returns setof jsonb language plpgsql security definer set search_path='' as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_time time := (now() at time zone 'Asia/Kolkata')::time;
  v_profile record;
  v_user_runs int;
  v_queued int;
  v_action_id uuid;
  v_deadline record;
  v_followup record;
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

  for v_profile in select p.user_id from public.profiles p loop
    select count(*) into v_user_runs
    from public.agent_runs ar
    where ar.user_id = v_profile.user_id
      and ar.workflow = '06-autopilot'
      and ar.status = 'ok'
      and (ar.ts at time zone 'Asia/Kolkata')::date = v_today;

    if not p_force and v_user_runs > 0 then
      continue;
    end if;

    v_queued := 0;

    for v_deadline in
      select m.id as match_id, m.opportunity_id, m.evaluation_day
      from public.matches m
      join public.applications a on a.user_id = m.user_id and a.opportunity_id = m.opportunity_id
      join public.opportunities o on o.user_id = a.user_id and o.id = a.opportunity_id
      where m.user_id = v_profile.user_id
        and a.status in ('to_apply', 'saved', 'applied', 'assessment', 'interview')
        and o.deadline between v_today + 1 and v_today + 7
    loop
      if v_deadline.evaluation_day is distinct from v_today then
        perform public.enqueue_evaluation(v_profile.user_id, v_deadline.opportunity_id);
        continue;
      end if;
      v_action_id := public.worker_queue_action(v_deadline.match_id, 'deadline_reminder', '{}'::jsonb, v_today::text);
      if v_action_id is not null then v_queued := v_queued + 1; end if;
    end loop;

    for v_followup in
      select f.id as followup_id, m.id as match_id
      from public.followups f
      join public.applications a on a.id = f.application_id and a.user_id = f.user_id
      join public.matches m on m.opportunity_id = a.opportunity_id and m.user_id = a.user_id
      where f.user_id = v_profile.user_id and f.status = 'pending' and f.due_at <= now()
    loop
      v_action_id := public.worker_queue_action(
        v_followup.match_id, 'followup_notification',
        jsonb_build_object('followup_id', v_followup.followup_id), v_followup.followup_id::text
      );
      if v_action_id is not null then v_queued := v_queued + 1; end if;
    end loop;

    perform public.record_agent_heartbeat(
      v_profile.user_id, '06-autopilot', 'ok', v_queued,
      ((v_today + 1) + time '09:00') at time zone 'Asia/Kolkata', null,
      jsonb_build_object('queued_actions', v_queued, 'delivery', 'See action results; queued is not delivered')
    );

    return next jsonb_build_object('user_id', v_profile.user_id, 'status', 'ok', 'queued', v_queued);
  end loop;
end; $$;

revoke all on function public.worker_check_and_run_autopilot(boolean) from public, anon, authenticated;
grant execute on function public.worker_check_and_run_autopilot(boolean) to service_role;

commit;
