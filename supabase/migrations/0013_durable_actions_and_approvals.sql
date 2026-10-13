begin;
create schema if not exists opportunityos_private;
revoke all on schema opportunityos_private from public,anon,authenticated;
grant usage on schema opportunityos_private to service_role;
alter table public.profiles add column notifications_enabled boolean not null default false;
alter table public.profiles add column email_alias_token text not null default replace(gen_random_uuid()::text,'-','');
create unique index profiles_email_alias on public.profiles(email_alias_token);

alter table public.actions drop constraint actions_type_check;
alter table public.actions add constraint actions_type_check check(type in ('tracker_update','calendar_event','calendar_link','email_notification','task_create','followup_schedule','approval_notification','deadline_reminder','followup_notification','error_notification'));
alter table public.actions drop constraint actions_status_check;
alter table public.actions add constraint actions_status_check check(status in ('pending','processing','done','failed','uncertain','blocked'));
alter table public.actions add column revision bigint;
alter table public.actions add column not_before timestamptz not null default now();
alter table public.actions add column attempts integer not null default 0;
revoke select on public.actions from authenticated;
grant select(id,user_id,match_id,type,status,idempotency_key,result,error,created_at,updated_at,attempts) on public.actions to authenticated;

alter table public.approvals drop constraint approvals_status_check;
alter table public.approvals add constraint approvals_status_check check(status in ('pending','approved','rejected','expired','stale'));
alter table public.approvals drop constraint approvals_user_id_match_id_key;
alter table public.approvals add column match_revision bigint not null default -1;
alter table public.approvals add column expires_at timestamptz not null default now();
alter table public.approvals add column requires_information boolean not null default true;
alter table public.approvals add column resume_status text not null default 'unbound' check(resume_status in ('unbound','waiting','pending','resumed','failed','expired','stale'));
create unique index approvals_revision on public.approvals(user_id,match_id,match_revision);
grant select(match_revision,expires_at,requires_information,resume_status) on public.approvals to authenticated;

alter table public.followups add constraint followups_unique_due unique(application_id,kind,due_at);
create table public.tasks(id uuid primary key default gen_random_uuid(),user_id uuid not null,opportunity_id uuid not null,title text not null,due_at date,status text not null default 'pending' check(status in ('pending','done')),created_at timestamptz not null default now(),unique(user_id,opportunity_id),foreign key(user_id,opportunity_id) references public.opportunities(user_id,id) on delete cascade);
alter table public.tasks enable row level security;
revoke all on public.tasks from public,anon,authenticated;
grant select on public.tasks to authenticated;
grant all on public.tasks to service_role;
create policy tasks_own on public.tasks for select to authenticated using(auth.uid()=user_id);
create table opportunityos_private.action_state(action_id uuid primary key references public.actions(id) on delete cascade,payload jsonb not null,claim_token uuid,claimed_until timestamptz);
create table opportunityos_private.approval_execution(approval_id uuid primary key references public.approvals(id) on delete cascade,execution_id text not null,resume_url text not null,nonce uuid not null default gen_random_uuid(),attempts integer not null default 0,next_attempt_at timestamptz not null default now(),claimed_until timestamptz,consumed_at timestamptz);
create table opportunityos_private.execution_owners(execution_id text primary key,user_id uuid not null references auth.users(id) on delete cascade,match_id uuid references public.matches(id) on delete cascade,workflow text not null);
create table opportunityos_private.settings(key text primary key,value text not null);
insert into opportunityos_private.settings values('demo_user_id','02efd0b0-c73c-4f5e-bb23-de6e2b2cc2f8'),('demo_email','opportunityos0001@gmail.com'),('agent_email','opportunityos0001@gmail.com') on conflict do nothing;
grant all on all tables in schema opportunityos_private to service_role;

create function public.worker_match_context(p_match uuid,p_execution text default null,p_workflow text default 'act') returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.matches%rowtype;o public.opportunities%rowtype;recipient text;demo boolean;
begin
 select * into m from public.matches where id=p_match and status='complete';if not found then return null;end if;
 select * into o from public.opportunities where id=m.opportunity_id and user_id=m.user_id;
 if p_execution is not null then insert into opportunityos_private.execution_owners values(p_execution,m.user_id,m.id,p_workflow) on conflict do nothing;end if;
 demo:=m.user_id::text=(select value from opportunityos_private.settings where key='demo_user_id');
 select case when demo then (select value from opportunityos_private.settings where key='demo_email') else u.email end into recipient from auth.users u where u.id=m.user_id;
 return jsonb_build_object('user_id',m.user_id,'match_id',m.id,'opportunity_id',o.id,'match',to_jsonb(m)-'snapshot'-'claim_token'-'claimed_until'-'cache_key','opportunity',to_jsonb(o)-'user_id','recipient',recipient,'demo_calendar',demo,'email_enabled',demo or (select notifications_enabled from public.profiles where user_id=m.user_id));
end; $$;

create function public.worker_action_allowed(p_match uuid,p_type text,p_revision bigint) returns boolean language plpgsql security definer set search_path='' as $$
declare m public.matches%rowtype;day_now date:=(now() at time zone 'Asia/Kolkata')::date;
begin
 select * into m from public.matches where id=p_match and revision=p_revision and status='complete';if not found then return false;end if;
 if p_type='error_notification' then return true;end if;
 if p_type='approval_notification' then return exists(select 1 from public.approvals where match_id=m.id and match_revision=m.revision and status='pending' and expires_at>now());end if;
 if m.eligibility_status is distinct from 'ELIGIBLE' or m.evaluation_day is distinct from day_now or not exists(select 1 from public.opportunities where id=m.opportunity_id and user_id=m.user_id and deadline>day_now) then return false;end if;
 if p_type in ('deadline_reminder','followup_notification') then return exists(select 1 from public.applications where user_id=m.user_id and opportunity_id=m.opportunity_id and status in ('saved','to_apply','applied','assessment','interview'));end if;
 return m.decision='ACT' or exists(select 1 from public.approvals where match_id=m.id and match_revision=m.revision and status='approved' and expires_at>now());
end; $$;

create function public.worker_queue_action(p_match uuid,p_type text,p_extra jsonb default '{}'::jsonb,p_suffix text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare c jsonb;m public.matches%rowtype;action_id uuid;k text;
begin
 if p_type not in ('tracker_update','task_create','calendar_link','calendar_event','email_notification','followup_schedule','approval_notification','deadline_reminder','followup_notification','error_notification') then raise exception 'Blocked action type';end if;
 select * into m from public.matches where id=p_match;if not found then raise exception 'Match unavailable';end if;
 if not public.worker_action_allowed(m.id,p_type,m.revision) then return null;end if;
 c:=public.worker_match_context(m.id);if p_type='calendar_event' and not (c->>'demo_calendar')::boolean then return null;end if;
 if p_type in ('email_notification','approval_notification','deadline_reminder','followup_notification','error_notification') and not (c->>'email_enabled')::boolean then return null;end if;
 k:=m.user_id::text||':'||m.id::text||':'||p_type||case when p_suffix='' then '' else ':'||p_suffix end;
 insert into public.actions(user_id,match_id,type,idempotency_key,revision) values(m.user_id,m.id,p_type,k,m.revision) on conflict(idempotency_key) do nothing returning id into action_id;
 if action_id is not null then insert into opportunityos_private.action_state(action_id,payload) values(action_id,c||p_extra||jsonb_build_object('user_id',m.user_id,'match_id',m.id,'type',p_type,'revision',m.revision));end if;
 return action_id;
end; $$;

create function public.worker_plan_actions(p_match uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare kind text;queued int:=0;id uuid;
begin
 foreach kind in array array['tracker_update','task_create','calendar_link','followup_schedule','calendar_event','email_notification'] loop id:=public.worker_queue_action(p_match,kind);if id is not null then queued:=queued+1;end if;end loop;
 return jsonb_build_object('match_id',p_match,'queued',queued);
end; $$;

create function public.worker_claim_action(p_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.actions%rowtype;s opportunityos_private.action_state%rowtype;token uuid:=gen_random_uuid();
begin
 -- A lost email result is uncertain; it must never be blindly resent.
 update public.actions a set status='uncertain',error='DELIVERY_UNCERTAIN',updated_at=now() from opportunityos_private.action_state s where s.action_id=a.id and a.status='processing' and s.claimed_until<now() and a.type in ('email_notification','approval_notification','deadline_reminder','followup_notification','error_notification');
 update public.actions a set status='pending',updated_at=now() from opportunityos_private.action_state s where s.action_id=a.id and a.status='processing' and s.claimed_until<now() and a.type not in ('email_notification','approval_notification','deadline_reminder','followup_notification','error_notification');
 select * into a from public.actions where status='pending' and not_before<=now() and (p_id is null or id=p_id) order by case type when 'tracker_update' then 0 when 'task_create' then 1 when 'calendar_link' then 2 when 'followup_schedule' then 3 when 'calendar_event' then 4 else 5 end,created_at,id limit 1 for update skip locked;
 if not found then return jsonb_build_object('claimed',false);end if;
 if not public.worker_action_allowed(a.match_id,a.type,a.revision) then update public.actions set status='blocked',error='POLICY_CHANGED',updated_at=now() where id=a.id;return jsonb_build_object('claimed',false);end if;
 update public.actions set status='processing',attempts=attempts+1,updated_at=now() where id=a.id;
 update opportunityos_private.action_state set claim_token=token,claimed_until=now()+interval '5 minutes' where action_id=a.id returning * into s;
 return s.payload||jsonb_build_object('claimed',true,'action_id',a.id,'claim_token',token,'idempotency_key',a.idempotency_key);
end; $$;

create function public.worker_finish_action(p_id uuid,p_token uuid,p_status text,p_result jsonb default '{}'::jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare a public.actions%rowtype;s opportunityos_private.action_state%rowtype;
begin
 select * into a from public.actions where id=p_id and status='processing' for update;
 select * into s from opportunityos_private.action_state where action_id=p_id and claim_token=p_token and claimed_until>now() for update;
 if a.id is null or s.action_id is null then return false;end if;
 if p_status not in ('done','failed','uncertain') then raise exception 'Invalid action result';end if;
 update public.actions set status=p_status,result=p_result,error=case when p_status='done' then null else coalesce(p_result->>'error_code','ACTION_FAILED') end,updated_at=now() where id=p_id;
 update opportunityos_private.action_state set claim_token=null,claimed_until=null where action_id=p_id;
 if p_status='done' and s.payload ? 'followup_id' then update public.followups set status='done' where id=(s.payload->>'followup_id')::uuid and user_id=a.user_id;end if;
 insert into public.events(user_id,stage,level,message,metadata) values(a.user_id,'act',case when p_status='done' then 'info' else 'error' end,a.type||': '||p_status,jsonb_build_object('action_id',a.id,'match_id',a.match_id,'type',a.type,'status',p_status));
 return true;
end; $$;

create function public.worker_apply_internal_action(p_id uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.actions%rowtype;s opportunityos_private.action_state%rowtype;o public.opportunities%rowtype;app_id uuid;result jsonb;
begin
 select * into a from public.actions where id=p_id and status='processing' for update;
 select * into s from opportunityos_private.action_state where action_id=p_id and claim_token=p_token and claimed_until>now() for update;
 if a.id is null or s.action_id is null then return jsonb_build_object('applied',false);end if;
 if not public.worker_action_allowed(a.match_id,a.type,a.revision) then perform public.worker_finish_action(a.id,p_token,'failed','{"error_code":"POLICY_CHANGED"}');return jsonb_build_object('applied',false);end if;
 select o1.* into o from public.opportunities o1 join public.matches m on m.opportunity_id=o1.id and m.user_id=o1.user_id where m.id=a.match_id;
 if a.type='tracker_update' then app_id:=public.upsert_application_tracker(a.user_id,o.id);result:=jsonb_build_object('application_id',app_id);
 elsif a.type='task_create' then insert into public.tasks(user_id,opportunity_id,title,due_at) values(a.user_id,o.id,'Review and apply: '||o.title,o.deadline) on conflict do nothing;result:='{"task_created":true}';
 elsif a.type='followup_schedule' then
 select id into app_id from public.applications where user_id=a.user_id and opportunity_id=o.id;if app_id is null then raise exception 'Tracker must be created first';end if;
 insert into public.followups(user_id,application_id,due_at,kind) values(a.user_id,app_id,((o.deadline-1)+time '09:00') at time zone 'Asia/Kolkata','deadline_reminder') on conflict do nothing;result:='{"followup_scheduled":true}';
 else raise exception 'Not an internal action';end if;
 perform public.worker_finish_action(a.id,p_token,'done',result);return result;
end; $$;

create function public.worker_create_approval(p_match uuid,p_execution text,p_resume text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb;m public.matches%rowtype;o public.opportunities%rowtype;a public.approvals%rowtype;expiry timestamptz;
begin
 if p_execution !~ '^[0-9]+$' or p_resume !~ '^https?://(localhost:5678|[a-z0-9-]+\.trycloudflare\.com)/webhook-waiting/[0-9]+/?$' then raise exception 'Invalid execution binding';end if;
 select * into m from public.matches where id=p_match and status='complete' and decision='ASK' for update;if not found then return jsonb_build_object('created',false);end if;
 select * into o from public.opportunities where id=m.opportunity_id and user_id=m.user_id;
 expiry:=least(now()+interval '48 hours',coalesce(o.deadline::timestamp at time zone 'Asia/Kolkata',now()+interval '48 hours'));
 if expiry<=now() then return jsonb_build_object('created',false);end if;
 update public.approvals set status='stale',resume_status='stale' where match_id=m.id and match_revision<>m.revision and status='pending';
 insert into public.approvals(user_id,match_id,reason,missing_info,match_revision,expires_at,requires_information,resume_status) values(m.user_id,m.id,m.explanation,m.reason_codes,m.revision,expiry,m.eligibility_status<>'ELIGIBLE','waiting') on conflict(user_id,match_id,match_revision) do nothing returning * into a;
 if a.id is null then return jsonb_build_object('created',false);end if;
 insert into opportunityos_private.approval_execution(approval_id,execution_id,resume_url) values(a.id,p_execution,p_resume);
 c:=public.worker_match_context(m.id,p_execution,'05-ask');
 perform public.worker_queue_action(m.id,'approval_notification',jsonb_build_object('approval_id',a.id,'expires_at',expiry,'requires_information',a.requires_information),'approval-'||a.id::text);
 insert into public.events(user_id,stage,level,message,metadata) values(m.user_id,'ask','info','Review requested; execution will wait',jsonb_build_object('approval_id',a.id,'match_id',m.id));
 return c||jsonb_build_object('created',true,'approval_id',a.id,'expires_at',expiry);
end; $$;

create function public.confirm_approval(p_id uuid,p_revision bigint,p_outcome text,p_reason text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.approvals%rowtype;m public.matches%rowtype;owner_id uuid:=auth.uid();
begin
 if owner_id is null or p_outcome not in ('approved','rejected') or length(p_reason)>2000 then raise exception 'Invalid authenticated decision';end if;
 select * into a from public.approvals where id=p_id and user_id=owner_id and match_revision=p_revision for update;
 if not found then raise exception 'Approval not found';end if;
 if a.status<>'pending' then return jsonb_build_object('accepted',false,'reason','ALREADY_RESOLVED');end if;
 if a.expires_at<=now() then update public.approvals set status='expired',resume_status='expired' where id=a.id;return jsonb_build_object('accepted',false,'reason','EXPIRED');end if;
 select * into m from public.matches where id=a.match_id and user_id=owner_id and revision=a.match_revision and status='complete' for update;
 if m.id is null then update public.approvals set status='stale',resume_status='stale' where id=a.id;return jsonb_build_object('accepted',false,'reason','STALE');end if;
 if p_outcome='approved' and (a.requires_information or m.eligibility_status<>'ELIGIBLE') then return jsonb_build_object('accepted',false,'reason','CORRECT_INFORMATION_REQUIRED');end if;
 if p_outcome='approved' and not exists(select 1 from public.opportunities where id=m.opportunity_id and user_id=owner_id and deadline>(now() at time zone 'Asia/Kolkata')::date) then return jsonb_build_object('accepted',false,'reason','EXPIRED');end if;
 if not exists(select 1 from opportunityos_private.approval_execution where approval_id=a.id) then return jsonb_build_object('accepted',false,'reason','EXECUTION_UNBOUND');end if;
 update public.approvals set status=p_outcome,decided_at=now(),updated_at=now(),resume_status='pending' where id=a.id;
 insert into public.user_feedback(user_id,match_id,outcome,reason) values(owner_id,m.id,p_outcome,p_reason);
 insert into public.events(user_id,stage,level,message,metadata) values(owner_id,'approval','info','Review decision recorded: '||p_outcome,jsonb_build_object('approval_id',a.id,'match_id',m.id));
 return jsonb_build_object('accepted',true,'resume_status','pending');
end; $$;

create function public.worker_claim_resume() returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.approvals%rowtype;b opportunityos_private.approval_execution%rowtype;
begin
 update public.approvals set status='expired',resume_status='expired' where status='pending' and expires_at<=now();
 select a1.* into a from public.approvals a1 join opportunityos_private.approval_execution b1 on b1.approval_id=a1.id where a1.resume_status='pending' and b1.next_attempt_at<=now() and coalesce(b1.claimed_until,'-infinity')<now() and b1.attempts<5 order by a1.decided_at limit 1 for update of a1 skip locked;
 if not found then return jsonb_build_object('claimed',false);end if;
 update opportunityos_private.approval_execution set attempts=attempts+1,claimed_until=now()+interval '15 seconds',next_attempt_at=now()+interval '15 seconds' where approval_id=a.id returning * into b;
 return jsonb_build_object('claimed',true,'approval_id',a.id,'url',b.resume_url,'nonce',b.nonce,'execution_id',b.execution_id);
end; $$;

create function public.worker_consume_resume(p_id uuid,p_execution text,p_nonce uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.approvals%rowtype;b opportunityos_private.approval_execution%rowtype;
begin
 select * into a from public.approvals where id=p_id for update;select * into b from opportunityos_private.approval_execution where approval_id=p_id and execution_id=p_execution and nonce=p_nonce and consumed_at is null for update;
 if a.id is null or b.approval_id is null or a.status not in ('approved','rejected') or a.resume_status<>'pending' then return jsonb_build_object('approved',false);end if;
 update opportunityos_private.approval_execution set consumed_at=now(),claimed_until=null where approval_id=a.id;
 update public.approvals set resume_status='resumed' where id=a.id;
 if a.status='rejected' or a.expires_at<=now() or not public.worker_action_allowed(a.match_id,'tracker_update',a.match_revision) then return jsonb_build_object('approved',false);end if;
 return jsonb_build_object('approved',true,'match_id',a.match_id);
end; $$;

create function public.worker_resume_attempt(p_id uuid,p_ok boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 update opportunityos_private.approval_execution set claimed_until=null where approval_id=p_id;
 update public.approvals set resume_status='failed' where id=p_id and resume_status='pending' and exists(select 1 from opportunityos_private.approval_execution where approval_id=p_id and attempts>=5);
 -- HTTP acceptance alone is not proof that the waiting execution consumed it.
end; $$;

create function public.set_notification_preference(p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin if auth.uid() is null then raise exception 'Authentication required';end if;update public.profiles set notifications_enabled=p_enabled where user_id=auth.uid();end; $$;
create function public.update_my_application(p_id uuid,p_status text,p_notes text default null) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_status not in ('saved','to_apply','applied','assessment','interview','offer','rejected') or length(coalesce(p_notes,''))>2000 then raise exception 'Invalid change';end if;
 update public.applications set status=p_status,notes=coalesce(p_notes,notes),updated_at=now() where id=p_id and user_id=auth.uid();if not found then return false;end if;
 insert into public.events(user_id,stage,level,message,metadata) values(auth.uid(),'tracker','info','Application status: '||p_status,jsonb_build_object('application_id',p_id));return true;
end; $$;
revoke update on public.applications from authenticated;

-- Harden every new function, including defaults inherited from PUBLIC.
do $$ declare f record;begin for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'worker_%' or p.proname in ('confirm_approval','set_notification_preference','update_my_application')) loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;end; $$;
grant execute on function public.confirm_approval(uuid,bigint,text,text),public.set_notification_preference(boolean),public.update_my_application(uuid,text,text) to authenticated;
do $$ declare t text;begin foreach t in array array['actions','approvals','applications','tasks','agent_runs'] loop if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;end loop;end; $$;
commit;
