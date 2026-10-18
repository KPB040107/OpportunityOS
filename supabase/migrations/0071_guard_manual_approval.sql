begin;

-- A student may record an application they made independently, but an
-- OpportunityOS approval must never override unknown or stale eligibility.
create or replace function public.guard_student_approval()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.choice = 'approve' and not exists (
    select 1 from public.matches m
    join public.opportunities o on o.id = m.opportunity_id and o.user_id = m.user_id
    where m.user_id = new.user_id
      and m.opportunity_id = new.opportunity_id
      and m.status = 'complete'
      and m.eligibility_status = 'ELIGIBLE'
      and m.evaluation_day = (now() at time zone 'Asia/Kolkata')::date
      and (o.deadline is null or o.deadline >= (now() at time zone 'Asia/Kolkata')::date)
  ) then
    raise exception 'ELIGIBILITY_NOT_VERIFIED';
  end if;
  return new;
end; $$;

drop trigger if exists guard_student_approval_insert on public.student_decisions;
create trigger guard_student_approval_insert
before insert on public.student_decisions
for each row execute function public.guard_student_approval();

revoke all on function public.guard_student_approval() from public, anon, authenticated;

create or replace function public.track_student_application(
  p_opportunity_id uuid,
  p_status text default 'to_apply',
  p_notes text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_app_id uuid;
  v_opp public.opportunities%rowtype;
  v_match public.matches%rowtype;
  v_can_approve boolean := false;
  v_decision jsonb := '{}'::jsonb;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if v_uid is null then return jsonb_build_object('error', 'UNAUTHORIZED'); end if;
  if p_status not in ('to_apply', 'applied') then
    return jsonb_build_object('error', 'INVALID_APPLICATION_STATUS');
  end if;

  select * into v_opp from public.opportunities
  where id = p_opportunity_id and user_id = v_uid;
  if not found then return jsonb_build_object('error', 'OPPORTUNITY_NOT_FOUND'); end if;

  select * into v_match from public.matches
  where opportunity_id = p_opportunity_id and user_id = v_uid;
  v_can_approve := found and v_match.status = 'complete'
    and v_match.eligibility_status = 'ELIGIBLE'
    and v_match.evaluation_day = v_today
    and (v_opp.deadline is null or v_opp.deadline >= v_today);

  if p_status = 'to_apply' and not v_can_approve then
    return jsonb_build_object('error', 'ELIGIBILITY_NOT_VERIFIED');
  end if;

  insert into public.applications(user_id, opportunity_id, status, notes)
  values (v_uid, p_opportunity_id, p_status, p_notes)
  on conflict (user_id, opportunity_id)
  do update set status = excluded.status,
                notes = coalesce(excluded.notes, applications.notes),
                updated_at = now()
  returning id into v_app_id;

  if v_can_approve then
    v_decision := public.record_student_decision(
      p_opportunity_id, 'approve', coalesce(p_notes, 'Manual student track'), false
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'application_id', v_app_id,
    'proposal_created', coalesce(v_decision->'proposal_created', 'false'::jsonb),
    'rule_id', v_decision->'rule_id'
  );
end; $$;

revoke all on function public.track_student_application(uuid, text, text) from public, anon;
grant execute on function public.track_student_application(uuid, text, text) to authenticated;

commit;
