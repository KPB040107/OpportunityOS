begin;
create or replace function public.worker_finish_discovery_run(
 p_run_id uuid,p_status text,p_found int,p_new int,p_updated int,p_error text default null,p_lease_token uuid default null,p_next_cursor jsonb default null
) returns boolean language plpgsql security definer set search_path='' as $$
declare r opportunityos_private.discovery_runs%rowtype;
begin
 if p_lease_token is null or p_status not in ('ok','error','quota_limited') or least(p_found,p_new,p_updated)<0 then return false; end if;
 update opportunityos_private.discovery_runs
 set status=p_status,items_found=p_found,items_new=p_new,items_updated=p_updated,error_message=p_error,completed_at=now()
 where id=p_run_id and lease_token=p_lease_token and status='running' and claimed_until>now()
 returning * into r;
 if not found then return false; end if;
 update opportunityos_private.source_registry s
 set last_successful_scan=case when p_status='ok' then now() else s.last_successful_scan end,
 item_count=(select count(*) from opportunityos_private.catalog_opportunities c where c.source_id=s.id),
 error_count=case when p_status='error' then s.error_count+1 else s.error_count end,
 last_error=p_error,cursor_state=coalesce(p_next_cursor,s.cursor_state),updated_at=now(),
 next_attempt=case when p_status<>'ok' then greatest(s.next_attempt,now()+interval '1 hour') else s.next_attempt end
 where s.id=r.source_id;
 return true;
end $$;
revoke all on function public.worker_finish_discovery_run(uuid,text,int,int,int,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.worker_finish_discovery_run(uuid,text,int,int,int,text,uuid,jsonb) to service_role;
revoke all on function public.worker_claim_due_discovery() from public,anon,authenticated;
grant execute on function public.worker_claim_due_discovery() to service_role;
commit;
