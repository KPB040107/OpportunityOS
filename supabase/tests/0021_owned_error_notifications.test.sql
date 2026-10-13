-- No real email is sent. Generic error ownership, consent, fencing and replay.
begin;
select set_config('opportunityos.error_u',gen_random_uuid()::text,true);
select set_config('opportunityos.error_b',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('opportunityos.error_u')::uuid,'error-'||current_setting('opportunityos.error_u')||'@example.invalid'),(current_setting('opportunityos.error_b')::uuid,'error-b-'||current_setting('opportunityos.error_b')||'@example.invalid');
insert into public.profiles(user_id,notifications_enabled) values(current_setting('opportunityos.error_u')::uuid,true),(current_setting('opportunityos.error_b')::uuid,false);
insert into opportunityos_private.execution_owners(execution_id,user_id,workflow) values('owned-error-'||current_setting('opportunityos.error_u'),current_setting('opportunityos.error_u')::uuid,'02-understand');
do $$ declare r jsonb;j uuid;c jsonb;begin
 r:=public.worker_record_error('owned-error-'||current_setting('opportunityos.error_u'),'DEMO Understand','DEMO node','DEMO redacted failure');if not (r->>'owner_attributed')::boolean then raise exception 'Error owner lost';end if;
 select id into j from public.actions where user_id=current_setting('opportunityos.error_u')::uuid and type='error_notification';if j is null then raise exception 'Error before matching failed to queue';end if;
 if exists(select 1 from public.actions where id=j and match_id is not null) then raise exception 'Error borrowed an unrelated match';end if;
 if public.worker_queue_error('owned-error-'||current_setting('opportunityos.error_u')) is not null then raise exception 'Error replay queued another email';end if;
 if public.worker_queue_error('unknown-execution') is not null then raise exception 'Unattributed error was emailed';end if;
 c:=public.worker_claim_action(j);if not coalesce((c->>'claimed')::boolean,false) then raise exception 'Owned error cannot be claimed';end if;
 if public.worker_finish_action(j,gen_random_uuid(),'done','{}') then raise exception 'Forged error completion accepted';end if;
 perform public.worker_finish_action(j,(c->>'claim_token')::uuid,'uncertain','{"error_code":"DEMO_DELIVERY_UNCERTAIN"}');
 c:=public.worker_claim_action(j);if coalesce((c->>'claimed')::boolean,false) then raise exception 'Uncertain error email resent';end if;
 begin insert into public.actions(user_id,type,idempotency_key) values(current_setting('opportunityos.error_u')::uuid,'calendar_event','DEMO-invalid-null-match');raise exception 'Matchless calendar action allowed';exception when check_violation then null;end;
end; $$;
-- Revoking consent after queueing must also stop a matchless error email.
insert into opportunityos_private.execution_owners(execution_id,user_id,workflow) values('owned-error-consent-'||current_setting('opportunityos.error_u'),current_setting('opportunityos.error_u')::uuid,'02-understand');
do $$ declare j uuid;c jsonb;begin
 j:=public.worker_queue_error('owned-error-consent-'||current_setting('opportunityos.error_u'));if j is null then raise exception 'Consented error did not queue';end if;
 update public.profiles set notifications_enabled=false where user_id=current_setting('opportunityos.error_u')::uuid;
 c:=public.worker_claim_action(j);if coalesce((c->>'claimed')::boolean,false) or (select status from public.actions where id=j)<>'blocked' then raise exception 'Revoked error consent still authorized email';end if;
 if public.worker_queue_error('owned-error-consent-'||current_setting('opportunityos.error_u')||'-new') is not null then raise exception 'Unattributed error queued';end if;
end; $$;
-- A malformed complete match with no decision must produce false, never SQL NULL.
insert into public.opportunities(user_id,fingerprint,title,deadline,type,extracted_json,extraction_confidence,extraction_version) values(current_setting('opportunityos.error_u')::uuid,repeat('e',64),'DEMO Null decision',(now() at time zone 'Asia/Kolkata')::date+7,'internship','{}',.9,'extract-v1');
update public.matches set status='complete',decision=null,eligibility_status='ELIGIBLE',evaluation_day=(now() at time zone 'Asia/Kolkata')::date where user_id=current_setting('opportunityos.error_u')::uuid;
do $$ declare m uuid;r bigint;begin
 select id,revision into m,r from public.matches where user_id=current_setting('opportunityos.error_u')::uuid;
 if m is null then raise exception 'Null-decision fixture missing';end if;
 if public.worker_action_allowed(m,'calendar_event',r) is distinct from false then raise exception 'Missing decision did not fail closed';end if;
end; $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('opportunityos.error_b'))::text,true);
do $$ begin
 if exists(select 1 from public.actions where user_id=current_setting('opportunityos.error_u')::uuid) then raise exception 'Cross-user generic error leaked';end if;
 if has_function_privilege(current_user,'public.worker_queue_error(text)','EXECUTE') then raise exception 'Client gained error-mail authority';end if;
end; $$;
reset role;
rollback;
select 'PASS: owned error notification without a match' as test_result;
