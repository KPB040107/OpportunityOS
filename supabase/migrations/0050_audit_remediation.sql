-- Migration 0050: Audit Remediation (Metadata RPC, Autonomy Feedback, Performance Indexes)
begin;

-- 1. Secure RPC for updating raw item capture metadata
create or replace function public.update_raw_item_metadata(
  p_id uuid,
  p_metadata jsonb
) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  update public.raw_items
  set metadata = p_metadata
  where id = p_id and user_id = auth.uid();
  return found;
end; $$;

revoke all on function public.update_raw_item_metadata(uuid, jsonb) from public, anon;
grant execute on function public.update_raw_item_metadata(uuid, jsonb) to authenticated;

-- 2. Propagate earned autonomy proposal feedback in track_student_application
create or replace function public.track_student_application(
  p_opportunity_id uuid,
  p_status text default 'to_apply',
  p_notes text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_app_id uuid;
  v_opp record;
  v_decision jsonb;
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

  -- Record decision and propagate proposal flags
  v_decision := public.record_student_decision(p_opportunity_id, 'approve', coalesce(p_notes, 'Manual student track'), false);

  return jsonb_build_object(
    'success', true,
    'application_id', v_app_id,
    'proposal_created', coalesce(v_decision->'proposal_created', 'false'::jsonb),
    'rule_id', v_decision->'rule_id'
  );
end; $$;

revoke all on function public.track_student_application(uuid, text, text) from public, anon;
grant execute on function public.track_student_application(uuid, text, text) to authenticated;

-- 3. Composite performance indexes
create index if not exists idx_opportunity_requirements_user_opp on public.opportunity_requirements(user_id, opportunity_id);
create index if not exists idx_actions_pending_not_before on public.actions(status, not_before) where status = 'pending';

commit;
