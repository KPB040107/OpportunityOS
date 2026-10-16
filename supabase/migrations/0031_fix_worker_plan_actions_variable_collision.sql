-- Migration 0031: Fix variable name collision in worker_plan_actions and secure privileges
-- Objective: Avoid ambiguous "id" column reference and ensure worker privileges

begin;

create or replace function public.worker_plan_actions(p_match uuid) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict error
declare
  v_kind text;
  v_queued int := 0;
  v_action_id uuid;
  m public.matches%rowtype;
  o public.opportunities%rowtype;
begin
  select * into m from public.matches where matches.id = p_match;
  if not found then return jsonb_build_object('match_id', p_match, 'queued', 0); end if;

  select * into o from public.opportunities where opportunities.id = m.opportunity_id and opportunities.user_id = m.user_id;
  if not found then return jsonb_build_object('match_id', p_match, 'queued', 0); end if;

  if o.deadline is not null then
    foreach v_kind in array array['tracker_update','task_create','calendar_link','followup_schedule','calendar_event','email_notification'] loop
      v_action_id := public.worker_queue_action(p_match, v_kind);
      if v_action_id is not null then v_queued := v_queued + 1; end if;
    end loop;
  else
    -- Missing deadline policy: queue only low-risk internal tracker and notification
    foreach v_kind in array array['tracker_update','email_notification'] loop
      v_action_id := public.worker_queue_action(p_match, v_kind);
      if v_action_id is not null then v_queued := v_queued + 1; end if;
    end loop;
  end if;

  return jsonb_build_object('match_id', p_match, 'queued', v_queued);
end; $$;

revoke all on function public.worker_plan_actions(uuid) from public, anon, authenticated;
grant execute on function public.worker_plan_actions(uuid) to service_role;

commit;
