-- Explicit safe retries must use the latest owned evaluation, while preserving
-- the stable action/event identity. Email uncertainty is never retried here.
begin;
create or replace function public.retry_my_action(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare a public.actions%rowtype;m public.matches%rowtype;c jsonb;
begin
 select * into a from public.actions where id=p_id and user_id=auth.uid() and status in ('failed','blocked') and attempts<3 for update;
 if not found or a.type not in ('tracker_update','task_create','calendar_link','calendar_event','followup_schedule') then return false;end if;
 select * into m from public.matches where id=a.match_id and user_id=a.user_id and status='complete' for share;
 if not found or public.worker_action_allowed(m.id,a.type,m.revision) is distinct from true then return false;end if;
 c:=public.worker_match_context(m.id);
 if c is null or (a.type='calendar_event' and (c->>'demo_calendar')::boolean is distinct from true) then return false;end if;
 update opportunityos_private.action_state set payload=payload||c||jsonb_build_object('user_id',a.user_id,'match_id',m.id,'type',a.type,'revision',m.revision),claim_token=null,claimed_until=null where action_id=a.id;
 if not found then raise exception 'Private action state unavailable';end if;
 update public.actions set status='pending',revision=m.revision,error=null,not_before=now(),updated_at=now() where id=a.id;
 insert into public.events(user_id,stage,level,message,metadata) values(a.user_id,'act','info','Safe action retry requested after current policy check',jsonb_build_object('action_id',a.id,'type',a.type));
 return true;
end; $$;
revoke all on function public.retry_my_action(uuid) from public,anon;
grant execute on function public.retry_my_action(uuid) to authenticated;
commit;
