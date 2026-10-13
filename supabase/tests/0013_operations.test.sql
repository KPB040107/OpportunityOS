-- Reversible security, approval and interrupted-action regression checks.
begin;
select set_config('opportunityos.repair_a',gen_random_uuid()::text,true);
select set_config('opportunityos.repair_b',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('opportunityos.repair_a')::uuid,'repair-a-'||current_setting('opportunityos.repair_a')||'@example.invalid'),(current_setting('opportunityos.repair_b')::uuid,'repair-b-'||current_setting('opportunityos.repair_b')||'@example.invalid');
insert into public.profiles(user_id,cgpa,graduation_year) values(current_setting('opportunityos.repair_a')::uuid,8.2,2028),(current_setting('opportunityos.repair_b')::uuid,8.2,2028);
insert into public.opportunities(user_id,fingerprint,title,organization,deadline,type,extracted_json,extraction_confidence,extraction_version) values(current_setting('opportunityos.repair_a')::uuid,repeat('d',64),'DEMO Repair Internship','Fictional Repair Lab',(now() at time zone 'Asia/Kolkata')::date+7,'internship','{}',.95,'extract-v1');
select set_config('opportunityos.repair_match',(select id::text from public.matches where user_id=current_setting('opportunityos.repair_a')::uuid),true);
update public.matches set status='complete',decision='ASK',eligibility_status='UNKNOWN',evaluation_day=(now() at time zone 'Asia/Kolkata')::date,explanation='Missing facts' where id=current_setting('opportunityos.repair_match')::uuid;
select set_config('opportunityos.repair_approval',(public.worker_create_approval(current_setting('opportunityos.repair_match')::uuid,'99999001','http://localhost:5678/webhook-waiting/99999001')->>'approval_id'),true);

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('opportunityos.repair_b'))::text,true);
do $$ begin
 if has_function_privilege(current_user,'public.worker_claim_action(uuid)','EXECUTE') or has_function_privilege(current_user,'public.claim_action(uuid,uuid,text,text)','EXECUTE') or has_function_privilege(current_user,'public.get_upcoming_deadlines(uuid,integer)','EXECUTE') or has_function_privilege(current_user,'public.claim_due_followups(uuid)','EXECUTE') or has_function_privilege(current_user,'public.record_agent_heartbeat(uuid,text,text,integer,timestamptz,text,jsonb)','EXECUTE') then raise exception 'Worker privilege leaked';end if;
 if has_schema_privilege(current_user,'opportunityos_private','USAGE') then raise exception 'Private schema leaked';end if;
 if exists(select 1 from public.approvals where user_id=current_setting('opportunityos.repair_a')::uuid) then raise exception 'Cross-user review leaked';end if;
 begin perform public.confirm_approval(current_setting('opportunityos.repair_approval')::uuid,1,'approved','forged');raise exception 'Cross-user confirmation succeeded';exception when raise_exception then if sqlerrm='Cross-user confirmation succeeded' then raise;end if;end;
 begin perform resume_url from public.approvals;raise exception 'Resume capability leaked';exception when insufficient_privilege then null;end;
end; $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('opportunityos.repair_a'))::text,true);
do $$ declare r jsonb;a record;begin
 select id,user_id,match_id,match_revision,expires_at into a from public.approvals where id=current_setting('opportunityos.repair_approval')::uuid;
 r:=public.confirm_approval(a.id,a.match_revision,'approved','Cannot waive UNKNOWN');if r->>'reason'<>'CORRECT_INFORMATION_REQUIRED' then raise exception 'UNKNOWN was bypassed';end if;
 if exists(select 1 from public.applications where user_id=a.user_id) then raise exception 'UNKNOWN created tracker';end if;
 r:=public.confirm_approval(a.id,a.match_revision,'rejected','Not suitable');if not (r->>'accepted')::boolean then raise exception 'Rejection failed';end if;
 r:=public.confirm_approval(a.id,a.match_revision,'rejected','Replay');if r->>'reason'<>'ALREADY_RESOLVED' then raise exception 'Replay accepted';end if;
 if (select count(*) from public.user_feedback where match_id=a.match_id)<>1 then raise exception 'Replay duplicated feedback';end if;
end; $$;
reset role;
do $$ declare a record;b opportunityos_private.approval_execution%rowtype;r jsonb;begin
 select id,user_id,match_id,match_revision,expires_at into a from public.approvals where id=current_setting('opportunityos.repair_approval')::uuid;select * into b from opportunityos_private.approval_execution where approval_id=a.id;
 r:=public.worker_consume_resume(a.id,b.execution_id,b.nonce);if (r->>'approved')::boolean then raise exception 'Rejected request acted';end if;
 r:=public.worker_consume_resume(a.id,b.execution_id,b.nonce);if (r->>'approved')::boolean then raise exception 'Resume replay acted';end if;
end; $$;

update public.matches set revision=revision+1,eligibility_status='ELIGIBLE',decision='ASK',explanation='Eligible but below autonomous threshold' where id=current_setting('opportunityos.repair_match')::uuid;
select set_config('opportunityos.repair_approval',(public.worker_create_approval(current_setting('opportunityos.repair_match')::uuid,'99999002','http://localhost:5678/webhook-waiting/99999002')->>'approval_id'),true);
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('opportunityos.repair_a'))::text,true);
do $$ declare a record;r jsonb;begin
 select id,user_id,match_id,match_revision,expires_at into a from public.approvals where id=current_setting('opportunityos.repair_approval')::uuid;
 if a.expires_at>now()+interval '48 hours' then raise exception 'Expiry too long';end if;
 r:=public.confirm_approval(a.id,a.match_revision,'approved','Explicit permitted-action review');if not (r->>'accepted')::boolean then raise exception 'Eligible confirmation failed';end if;
 if exists(select 1 from public.applications where user_id=a.user_id) then raise exception 'UI performed actions before execution resumed';end if;
end; $$;
reset role;
do $$ declare a record;b opportunityos_private.approval_execution%rowtype;r jsonb;begin
 select id,user_id,match_id,match_revision,expires_at into a from public.approvals where id=current_setting('opportunityos.repair_approval')::uuid;select * into b from opportunityos_private.approval_execution where approval_id=a.id;
 r:=public.worker_consume_resume(a.id,b.execution_id,b.nonce);if not (r->>'approved')::boolean then raise exception 'Bound confirmation did not resume';end if;
 r:=public.worker_consume_resume(a.id,b.execution_id,b.nonce);if (r->>'approved')::boolean then raise exception 'Nonce replay acted';end if;
end; $$;

-- A failed internal/calendar operation can be reconciled, while uncertain mail cannot resend.
do $$ declare m uuid:=current_setting('opportunityos.repair_match')::uuid;id uuid;c jsonb;c2 jsonb;begin
 id:=public.worker_queue_action(m,'tracker_update');if id is null then raise exception 'Approved plan not authorized';end if;
 c:=public.worker_claim_action(id);if not (c->>'claimed')::boolean then raise exception 'Atomic claim failed';end if;
 c2:=public.worker_claim_action(id);if (c2->>'claimed')::boolean then raise exception 'Concurrent claim repeated';end if;
 if public.worker_finish_action(id,gen_random_uuid(),'done','{}') then raise exception 'Forged claim token accepted';end if;
 perform public.worker_apply_internal_action(id,(c->>'claim_token')::uuid);
 if public.worker_queue_action(m,'tracker_update') is not null then raise exception 'Duplicate internal action queued';end if;
 if (select count(*) from public.applications where user_id=current_setting('opportunityos.repair_a')::uuid)<>1 then raise exception 'Tracker did not apply once';end if;
 begin perform public.worker_queue_action(m,'submit_application');raise exception 'Application submission allowed';exception when raise_exception then if sqlerrm='Application submission allowed' then raise;end if;end;
 update public.profiles set notifications_enabled=true where user_id=current_setting('opportunityos.repair_a')::uuid;
 id:=public.worker_queue_action(m,'email_notification');c:=public.worker_claim_action(id);
 if id is null or not coalesce((c->>'claimed')::boolean,false) then raise exception 'Email uncertainty test did not obtain a real claim';end if;
 update opportunityos_private.action_state set claimed_until=now()-interval '1 second' where action_id=id;
 c2:=public.worker_claim_action(id);if (c2->>'claimed')::boolean or (select status from public.actions where actions.id=(c->>'action_id')::uuid)<>'uncertain' then raise exception 'Uncertain email was resent';end if;
end; $$;

-- Forward ownership is derived from the alias; duplicates keep one raw item.
do $$ declare alias text;request uuid:=gen_random_uuid();a jsonb;b jsonb;begin
 select email_alias_token into alias from public.profiles where user_id=current_setting('opportunityos.repair_a')::uuid;
 a:=public.worker_ingest_email(alias,request,'DEMO DATA Internship. Apply before next week.');b:=public.worker_ingest_email(alias,request,'DEMO DATA Internship. Apply before next week.');
 if not (a->>'accepted')::boolean or a->>'raw_item_id'<>b->>'raw_item_id' then raise exception 'Forwarding was not idempotent';end if;
 if (select user_id from public.raw_items where id=(a->>'raw_item_id')::uuid)<>current_setting('opportunityos.repair_a')::uuid then raise exception 'Forwarding owner mismatch';end if;
 if (public.worker_ingest_email(repeat('z',32),gen_random_uuid(),'Internship')->>'accepted')::boolean then raise exception 'Unknown alias accepted';end if;
end; $$;
set local role anon;
do $$ begin if has_function_privilege(current_user,'public.confirm_approval(uuid,bigint,text,text)','EXECUTE') or has_function_privilege(current_user,'public.worker_ingest_email(text,uuid,text)','EXECUTE') or has_function_privilege(current_user,'public.resolve_approval(uuid,text,text)','EXECUTE') then raise exception 'Anonymous approval/worker privilege leaked';end if;end; $$;
reset role;
rollback;
select 'PASS: ownership RPCs, private capabilities, UNKNOWN gate, explicit approval/rejection, nonce/replay, actions, uncertainty, forwarding' as result;
