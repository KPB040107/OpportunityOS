-- Close the Slice 4/5 privileged-RPC boundary before deploying new workers.
begin;
revoke all on function public.claim_action(uuid,uuid,text,text),public.finish_action(text,text,jsonb,text),public.upsert_application_tracker(uuid,uuid,text,text),public.create_approval_request(uuid,uuid,text,text[],text),public.resolve_approval(uuid,text,text),public.record_agent_heartbeat(uuid,text,text,int,timestamptz,text,jsonb),public.seed_default_sources(uuid),public.get_upcoming_deadlines(uuid,int),public.claim_due_followups(uuid) from public,anon,authenticated;
grant execute on function public.claim_action(uuid,uuid,text,text),public.finish_action(text,text,jsonb,text),public.upsert_application_tracker(uuid,uuid,text,text),public.create_approval_request(uuid,uuid,text,text[],text),public.record_agent_heartbeat(uuid,text,text,int,timestamptz,text,jsonb),public.seed_default_sources(uuid),public.get_upcoming_deadlines(uuid,int),public.claim_due_followups(uuid) to service_role;

-- Resume capabilities are private worker state, never browser-readable columns.
revoke select on public.approvals from authenticated;
grant select(id,user_id,match_id,reason,missing_info,status,decided_at,created_at,updated_at) on public.approvals to authenticated;
drop policy if exists agent_runs_own on public.agent_runs;
create policy agent_runs_own on public.agent_runs for select to authenticated using ((select auth.uid())=user_id);
revoke insert,update on public.sources from authenticated;
grant insert(user_id,name,url,type,frequency,enabled,keywords),update(name,url,type,frequency,enabled,keywords,updated_at) on public.sources to authenticated;

create function public.seed_my_sources() returns int language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid();
begin
 if owner_id is null then raise exception 'Authentication required';end if;
 return public.seed_default_sources(owner_id);
end; $$;
revoke all on function public.seed_my_sources() from public,anon;
grant execute on function public.seed_my_sources() to authenticated;

-- The old resolver is retired. A fenced authenticated bridge replaces it next.
create or replace function public.resolve_approval(p_approval_id uuid,p_outcome text,p_reason text default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception 'Use the authenticated approval confirmation bridge';end; $$;
commit;
