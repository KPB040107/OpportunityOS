begin;

create or replace function public.track_student_application(
  p_opportunity_id uuid,
  p_status text default 'to_apply',
  p_notes text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_app_id uuid;
  v_opp record;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;

  select id into v_opp from public.opportunities where id = p_opportunity_id and user_id = v_uid;
  if not found then
    return jsonb_build_object('error', 'OPPORTUNITY_NOT_FOUND');
  end if;

  insert into public.applications(user_id, opportunity_id, status, notes)
  values (v_uid, p_opportunity_id, coalesce(p_status, 'to_apply'), p_notes)
  on conflict (user_id, opportunity_id)
  do update set status = excluded.status, notes = coalesce(excluded.notes, applications.notes), updated_at = now()
  returning id into v_app_id;

  -- Also record student decision to train autonomy
  perform public.record_student_decision(p_opportunity_id, 'approve', coalesce(p_notes, 'Manual student track'), false);

  return jsonb_build_object('success', true, 'application_id', v_app_id);
end; $$;

revoke all on function public.track_student_application(uuid, text, text) from public, anon;
grant execute on function public.track_student_application(uuid, text, text) to authenticated;

commit;

select 'PASS: Created track_student_application RPC' as result;
