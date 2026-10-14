-- Migration 0022: Autopilot Bounded Recovery
-- Safely detects and executes missed daily scans post-09:00 IST with strict idempotency and error isolation.

begin;

create or replace function public.worker_check_and_run_autopilot(p_force boolean default false)
returns setof jsonb language plpgsql security definer set search_path='' as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_time time := (now() at time zone 'Asia/Kolkata')::time;
  v_runs_today int;
  v_row jsonb;
begin
  -- Check for existing successful autopilot runs today in Asia/Kolkata
  select count(*) into v_runs_today
  from public.agent_runs
  where workflow = '06-autopilot'
    and status = 'ok'
    and (ts at time zone 'Asia/Kolkata')::date = v_today;

  if not p_force then
    -- Before 09:00 IST: not due yet
    if v_time < time '09:00' then
      return next jsonb_build_object(
        'status', 'not_due',
        'queued', 0,
        'today', v_today,
        'current_time_ist', v_time::text,
        'message', 'Daily scan scheduled for 09:00 Asia/Kolkata'
      );
      return;
    end if;

    -- Already completed today: preserve idempotency, no duplicate run
    if v_runs_today > 0 then
      return next jsonb_build_object(
        'status', 'already_ran',
        'queued', 0,
        'today', v_today,
        'runs_today', v_runs_today,
        'message', 'Autopilot daily scan has already completed for today'
      );
      return;
    end if;
  end if;

  -- Missed post-09:00 IST or forced: execute scan bounded to today
  for v_row in select public.worker_prepare_autopilot() as res loop
    return next v_row;
  end loop;
end;
$$;

revoke all on function public.worker_check_and_run_autopilot(boolean) from public, anon, authenticated;
grant execute on function public.worker_check_and_run_autopilot(boolean) to service_role;

commit;
