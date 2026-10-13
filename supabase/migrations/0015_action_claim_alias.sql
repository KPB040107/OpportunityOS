-- Repair the SQL alias collision; privilege and policy scope are unchanged.
begin;
create or replace function public.worker_claim_action(p_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.actions%rowtype;s opportunityos_private.action_state%rowtype;token uuid:=gen_random_uuid();
begin
 -- A lost email result is uncertain; it must never be blindly resent.
 update public.actions a set status='uncertain',error='DELIVERY_UNCERTAIN',updated_at=now() from opportunityos_private.action_state lease where lease.action_id=a.id and a.status='processing' and lease.claimed_until<now() and a.type in ('email_notification','approval_notification','deadline_reminder','followup_notification','error_notification');
 update public.actions a set status='pending',updated_at=now() from opportunityos_private.action_state lease where lease.action_id=a.id and a.status='processing' and lease.claimed_until<now() and a.type not in ('email_notification','approval_notification','deadline_reminder','followup_notification','error_notification');
 select * into a from public.actions where status='pending' and not_before<=now() and (p_id is null or id=p_id) order by case type when 'tracker_update' then 0 when 'task_create' then 1 when 'calendar_link' then 2 when 'followup_schedule' then 3 when 'calendar_event' then 4 else 5 end,created_at,id limit 1 for update skip locked;
 if not found then return jsonb_build_object('claimed',false);end if;
 if not public.worker_action_allowed(a.match_id,a.type,a.revision) then update public.actions set status='blocked',error='POLICY_CHANGED',updated_at=now() where id=a.id;return jsonb_build_object('claimed',false);end if;
 update public.actions set status='processing',attempts=attempts+1,updated_at=now() where id=a.id;
 update opportunityos_private.action_state set claim_token=token,claimed_until=now()+interval '5 minutes' where action_id=a.id returning * into s;
 return s.payload||jsonb_build_object('claimed',true,'action_id',a.id,'claim_token',token,'idempotency_key',a.idempotency_key);
end; $$;

commit;
