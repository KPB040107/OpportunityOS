begin;
create or replace function public.worker_claim_due_discovery()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r opportunityos_private.source_registry%rowtype;
  v_run_id uuid;
  v_lease_token uuid := gen_random_uuid();
begin
  -- Recover scans that lost their worker after a database or network failure.
  with expired as (
    update opportunityos_private.discovery_runs
    set status='error',error_message='DISCOVERY_LEASE_EXPIRED',completed_at=now()
    where status='running' and claimed_until<now()
    returning source_id
  )
  update opportunityos_private.source_registry s set next_attempt=now(),last_error='DISCOVERY_LEASE_EXPIRED',error_count=s.error_count+1,updated_at=now()
  where s.id in (select source_id from expired) and s.status='active';
  select * into r
  from opportunityos_private.source_registry
  where status = 'active'
    and superseded_by is null
    and next_attempt <= now()
  order by next_attempt asc
  for update skip locked
  limit 1;

  if r.id is null then
    return jsonb_build_object('claimed', false);
  end if;

  insert into opportunityos_private.discovery_runs(
    source_id,
    adapter,
    lease_token,
    status
  )
  values (
    r.id,
    r.adapter,
    v_lease_token,
    'running'
  )
  returning id into v_run_id;

  update opportunityos_private.source_registry
  set next_attempt = now() + case
    when r.cadence = 'hourly' then interval '1 hour'
    when r.cadence = 'daily' then interval '1 day'
    else interval '1 day'
  end
  where id = r.id;

  return jsonb_build_object(
    'claimed', true,
    'run_id', v_run_id,
    'source_id', r.id,
    'name', r.name,
    'adapter', r.adapter,
    'config', r.config,
    'cursor_state', coalesce(r.cursor_state, '{"offset": 0}'::jsonb),
    'lease_token', v_lease_token
  );
end;
$$;


revoke all on function public.worker_claim_due_discovery() from public,anon,authenticated;
grant execute on function public.worker_claim_due_discovery() to service_role;
commit;
