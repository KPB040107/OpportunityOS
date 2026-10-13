-- Email consent is checked at queue and claim time, including the controlled demo account.
-- Operational preferences do not change matching evidence or invalidate reviews.
begin;
create or replace function public.worker_match_context(p_match uuid,p_execution text default null,p_workflow text default 'act') returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.matches%rowtype;o public.opportunities%rowtype;recipient text;demo boolean;
begin
 select * into m from public.matches where id=p_match and status='complete';if not found then return null;end if;
 select * into o from public.opportunities where id=m.opportunity_id and user_id=m.user_id;
 if p_execution is not null then insert into opportunityos_private.execution_owners values(p_execution,m.user_id,m.id,p_workflow) on conflict do nothing;end if;
 demo:=m.user_id::text=(select value from opportunityos_private.settings where key='demo_user_id');
 select case when demo then (select value from opportunityos_private.settings where key='demo_email') else u.email end into recipient from auth.users u where u.id=m.user_id;
 return jsonb_build_object('user_id',m.user_id,'match_id',m.id,'opportunity_id',o.id,'match',to_jsonb(m)-'snapshot'-'claim_token'-'claimed_until'-'cache_key','opportunity',to_jsonb(o)-'user_id','recipient',recipient,'demo_calendar',demo,'email_enabled',(select notifications_enabled from public.profiles where user_id=m.user_id));
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
 return m.decision='ACT' or exists(select 1 from public.approvals where match_id=m.id and match_revision=m.revision and status='approved' and expires_at>now());
end; $$;

create or replace function public.queue_profile_evaluations() returns trigger language plpgsql security definer set search_path='' as $$
declare u uuid;
begin
 u:=case when TG_OP='DELETE' then old.user_id else new.user_id end;
 if TG_TABLE_NAME='profiles' and TG_OP='UPDATE' then
  if (to_jsonb(new)-'updated_at'-'display_name'-'notifications_enabled'-'email_alias_token')=(to_jsonb(old)-'updated_at'-'display_name'-'notifications_enabled'-'email_alias_token') then return new;end if;
 end if;
 perform public.enqueue_evaluation(u,id) from public.opportunities where user_id=u;
 return case when TG_OP='DELETE' then old else new end;
end; $$;

commit;
