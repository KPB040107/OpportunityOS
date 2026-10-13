begin;
alter table public.raw_items drop constraint raw_items_source_type_check;
alter table public.raw_items add constraint raw_items_source_type_check check(source_type in ('text','url','email'));
create function public.worker_ingest_email(p_alias text,p_request uuid,p_text text) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid;r record;
begin
 if p_alias !~ '^[a-f0-9]{32}$' or length(p_text)>20000 or length(p_text)<1 then return jsonb_build_object('accepted',false);end if;
 select user_id into owner_id from public.profiles where email_alias_token=p_alias;if not found then return jsonb_build_object('accepted',false);end if;
 select * into r from public.ingest_raw_item(owner_id,p_request,'text',p_text);
 update public.raw_items set source_type='email' where id=r.raw_item_id and user_id=owner_id;
 return jsonb_build_object('accepted',true,'raw_item_id',r.raw_item_id,'was_created',r.was_created);
end; $$;

create or replace function public.get_upcoming_deadlines(p_user uuid,p_days int default 7) returns table(application_id uuid,opportunity_id uuid,title text,organization text,deadline date,status text,days_remaining int) language sql security definer set search_path='' as $$
 select a.id,o.id,o.title,o.organization,o.deadline,a.status,o.deadline-(now() at time zone 'Asia/Kolkata')::date from public.applications a join public.opportunities o on o.id=a.opportunity_id and o.user_id=a.user_id where a.user_id=p_user and a.status in ('to_apply','saved','applied','assessment','interview') and o.deadline between (now() at time zone 'Asia/Kolkata')::date and (now() at time zone 'Asia/Kolkata')::date+least(greatest(p_days,0),30) order by o.deadline;
$$;
-- Retire the misleading legacy claim that marked undelivered follow-ups done.
create or replace function public.claim_due_followups(p_user uuid) returns table(followup_id uuid,application_id uuid,kind text,due_at timestamptz) language sql security definer set search_path='' as $$
 select f.id,f.application_id,f.kind,f.due_at from public.followups f where f.user_id=p_user and f.status='pending' and f.due_at<=now() order by f.due_at;
$$;

create function public.worker_prepare_autopilot() returns setof jsonb language plpgsql security definer set search_path='' as $$
declare u record;r record;f record;queued int;id uuid;today date:=(now() at time zone 'Asia/Kolkata')::date;
begin
 for u in select user_id from public.profiles loop
  queued:=0;
  for r in select m.id,m.evaluation_day from public.matches m join public.applications a on a.user_id=m.user_id and a.opportunity_id=m.opportunity_id join public.opportunities o on o.user_id=a.user_id and o.id=a.opportunity_id where m.user_id=u.user_id and a.status in ('to_apply','saved','applied','assessment','interview') and o.deadline between today+1 and today+7 loop
   if r.evaluation_day is distinct from today then perform public.enqueue_evaluation(u.user_id,(select opportunity_id from public.matches where id=r.id));continue;end if;
   id:=public.worker_queue_action(r.id,'deadline_reminder','{}'::jsonb,today::text);if id is not null then queued:=queued+1;end if;
  end loop;
  for f in select f1.id,m.id as match_id from public.followups f1 join public.applications a on a.id=f1.application_id and a.user_id=f1.user_id join public.matches m on m.opportunity_id=a.opportunity_id and m.user_id=a.user_id where f1.user_id=u.user_id and f1.status='pending' and f1.due_at<=now() loop
   id:=public.worker_queue_action(f.match_id,'followup_notification',jsonb_build_object('followup_id',f.id),f.id::text);if id is not null then queued:=queued+1;end if;
  end loop;
  perform public.record_agent_heartbeat(u.user_id,'06-autopilot','ok',queued,((today+1)+time '09:00') at time zone 'Asia/Kolkata',null,jsonb_build_object('queued_actions',queued,'delivery','See action results; queued is not delivered'));
  return next jsonb_build_object('user_id',u.user_id,'queued',queued);
 end loop;
end; $$;

create function public.worker_record_error(p_execution text,p_workflow text,p_node text,p_message text) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid;match_id uuid;
begin
 select e.user_id,e.match_id into owner_id,match_id from opportunityos_private.execution_owners e where e.execution_id=p_execution;
 insert into public.agent_runs(user_id,workflow,status,error_message,details) values(owner_id,left(p_workflow,200),'error',left(p_message,1000),jsonb_build_object('execution_id',p_execution,'node',left(p_node,200)));
 if owner_id is not null then
 insert into public.events(user_id,stage,level,message,metadata) values(owner_id,'error','error','A workflow failed; review activity and action results',jsonb_build_object('workflow',left(p_workflow,200),'node',left(p_node,200),'execution_id',p_execution));
 if match_id is not null then perform public.worker_queue_action(match_id,'error_notification',jsonb_build_object('error_summary','A workflow needs attention. Sign in and check your activity.'),'execution-'||p_execution);end if;
 end if;
 return jsonb_build_object('logged',true,'owner_attributed',owner_id is not null);
end; $$;
create function public.retry_my_action(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare a public.actions%rowtype;
begin
 select * into a from public.actions where id=p_id and user_id=auth.uid() and status='failed' and attempts<3 for update;
 if not found or not public.worker_action_allowed(a.match_id,a.type,a.revision) then return false;end if;
 -- Uncertain mail never enters this retry path.
 update public.actions set status='pending',error=null,not_before=now() where id=p_id;return true;
end; $$;
create function public.retry_my_resume(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.approvals set resume_status='pending' where id=p_id and user_id=auth.uid() and resume_status='failed' and expires_at>now();if not found then return false;end if;
 update opportunityos_private.approval_execution set attempts=0,claimed_until=null,next_attempt_at=now() where approval_id=p_id;return true;
end; $$;
revoke all on function public.worker_ingest_email(text,uuid,text),public.worker_prepare_autopilot(),public.worker_record_error(text,text,text,text),public.retry_my_action(uuid),public.retry_my_resume(uuid) from public,anon,authenticated;
grant execute on function public.worker_ingest_email(text,uuid,text),public.worker_prepare_autopilot(),public.worker_record_error(text,text,text,text) to service_role;
grant execute on function public.retry_my_action(uuid),public.retry_my_resume(uuid) to authenticated;
revoke all on function public.get_upcoming_deadlines(uuid,int),public.claim_due_followups(uuid) from public,anon,authenticated;
grant execute on function public.get_upcoming_deadlines(uuid,int),public.claim_due_followups(uuid) to service_role;
commit;
