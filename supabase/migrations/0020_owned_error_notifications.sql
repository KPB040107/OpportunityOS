-- Owned failures can occur before a match exists. Only error notifications may
-- omit a match; their owner comes from the private execution registry.
begin;
alter table public.actions alter column match_id drop not null;
alter table public.actions add constraint actions_error_match_boundary check(match_id is not null or type='error_notification');
alter table public.actions add constraint actions_owner_auth foreign key(user_id) references auth.users(id) on delete cascade;

create function public.worker_queue_error(p_execution text) returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid;job_id uuid;recipient text;demo boolean;
begin
 select user_id into owner_id from opportunityos_private.execution_owners where execution_id=p_execution;
 if owner_id is null or not coalesce((select notifications_enabled from public.profiles where user_id=owner_id),false) then return null;end if;
 demo:=owner_id::text=(select value from opportunityos_private.settings where key='demo_user_id');
 select case when demo then (select value from opportunityos_private.settings where key='demo_email') else email end into recipient from auth.users where id=owner_id;
 if recipient is null then return null;end if;
 insert into public.actions(user_id,match_id,type,idempotency_key) values(owner_id,null,'error_notification',owner_id::text||':execution:'||p_execution||':error_notification') on conflict(idempotency_key) do nothing returning id into job_id;
 if job_id is not null then
  insert into opportunityos_private.action_state(action_id,payload) values(job_id,jsonb_build_object('user_id',owner_id,'match_id',null,'type','error_notification','recipient',recipient,'demo_calendar',demo,'email_enabled',true,'opportunity',jsonb_build_object('title','Workflow needs attention'),'match','{}'::jsonb,'error_summary','A workflow needs attention. Sign in and check your activity.'));
 end if;
 return job_id;
end; $$;
revoke all on function public.worker_queue_error(text) from public,anon,authenticated;
grant execute on function public.worker_queue_error(text) to service_role;

create or replace function public.worker_record_error(p_execution text,p_workflow text,p_node text,p_message text) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
 select user_id into owner_id from opportunityos_private.execution_owners where execution_id=p_execution;
 insert into public.agent_runs(user_id,workflow,status,error_message,details) values(owner_id,left(p_workflow,200),'error',left(p_message,1000),jsonb_build_object('execution_id',p_execution,'node',left(p_node,200)));
 if owner_id is not null then
  insert into public.events(user_id,stage,level,message,metadata) values(owner_id,'error','error','A workflow failed; review activity and action results',jsonb_build_object('workflow',left(p_workflow,200),'node',left(p_node,200),'execution_id',p_execution));
  perform public.worker_queue_error(p_execution);
 end if;
 return jsonb_build_object('logged',true,'owner_attributed',owner_id is not null);
end; $$;

create or replace function public.worker_claim_action(p_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.actions%rowtype;s opportunityos_private.action_state%rowtype;token uuid:=gen_random_uuid();permitted boolean;
begin
 update public.actions jobs set status='uncertain',error='DELIVERY_UNCERTAIN',updated_at=now() from opportunityos_private.action_state lease where lease.action_id=jobs.id and jobs.status='processing' and lease.claimed_until<now() and jobs.type in ('email_notification','approval_notification','deadline_reminder','followup_notification','error_notification');
 update public.actions jobs set status='pending',updated_at=now() from opportunityos_private.action_state lease where lease.action_id=jobs.id and jobs.status='processing' and lease.claimed_until<now() and jobs.type not in ('email_notification','approval_notification','deadline_reminder','followup_notification','error_notification');
 select * into a from public.actions where status='pending' and not_before<=now() and (p_id is null or id=p_id) order by case type when 'tracker_update' then 0 when 'task_create' then 1 when 'calendar_link' then 2 when 'followup_schedule' then 3 when 'calendar_event' then 4 else 5 end,created_at,id limit 1 for update skip locked;
 if not found then return jsonb_build_object('claimed',false);end if;
 if a.type='error_notification' and a.match_id is null then
  permitted:=coalesce((select notifications_enabled from public.profiles where user_id=a.user_id),false);
 else permitted:=public.worker_action_allowed(a.match_id,a.type,a.revision);end if;
 if permitted is distinct from true then update public.actions set status='blocked',error='POLICY_CHANGED',updated_at=now() where id=a.id;return jsonb_build_object('claimed',false);end if;
 update public.actions set status='processing',attempts=attempts+1,updated_at=now() where id=a.id;
 update opportunityos_private.action_state set claim_token=token,claimed_until=now()+interval '5 minutes' where action_id=a.id returning * into s;
 if not found then raise exception 'Private action claim state missing';end if;
 return s.payload||jsonb_build_object('claimed',true,'action_id',a.id,'claim_token',token,'idempotency_key',a.idempotency_key);
end; $$;
create or replace function public.worker_action_allowed(p_match uuid,p_type text,p_revision bigint) returns boolean language plpgsql security definer set search_path='' as $$
declare m public.matches%rowtype;day_now date:=(now() at time zone 'Asia/Kolkata')::date;
begin
 select * into m from public.matches where id=p_match and revision=p_revision and status='complete';if not found then return false;end if;
 if p_type in ('email_notification','approval_notification','deadline_reminder','followup_notification','error_notification') and not coalesce((select notifications_enabled from public.profiles where user_id=m.user_id),false) then return false;end if;
 if p_type='error_notification' then return true;end if;
 if p_type='approval_notification' then return exists(select 1 from public.approvals where match_id=m.id and match_revision=m.revision and status='pending' and expires_at>now());end if;
 if m.eligibility_status is distinct from 'ELIGIBLE' or m.evaluation_day is distinct from day_now or not exists(select 1 from public.opportunities where id=m.opportunity_id and user_id=m.user_id and deadline>day_now) then return false;end if;
 if p_type in ('deadline_reminder','followup_notification') then return exists(select 1 from public.applications where user_id=m.user_id and opportunity_id=m.opportunity_id and status in ('saved','to_apply','applied','assessment','interview'));end if;
 return coalesce(m.decision='ACT',false) or exists(select 1 from public.approvals where match_id=m.id and match_revision=m.revision and status='approved' and expires_at>now());
end; $$;

commit;
