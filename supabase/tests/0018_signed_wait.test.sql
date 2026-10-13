-- Signed resume adapter rejects another execution, external origins and malformed signatures.
begin;
select set_config('opportunityos.signed_u',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('opportunityos.signed_u')::uuid,'signed-'||current_setting('opportunityos.signed_u')||'@example.invalid');
insert into public.profiles(user_id) values(current_setting('opportunityos.signed_u')::uuid);
insert into public.opportunities(user_id,fingerprint,title,deadline,type,extracted_json,extraction_confidence,extraction_version) values(current_setting('opportunityos.signed_u')::uuid,repeat('e',64),'DEMO Signed Wait',current_date+7,'internship','{}',.95,'extract-v1');
update public.matches set status='complete',decision='ASK',eligibility_status='UNKNOWN',explanation='DEMO signed wait adapter test' where user_id=current_setting('opportunityos.signed_u')::uuid;
do $$ declare m uuid;r jsonb;u text;begin
 select id into m from public.matches where user_id=current_setting('opportunityos.signed_u')::uuid;
 foreach u in array array['http://localhost:5678/webhook-waiting/99999019','https://example.com/webhook-waiting/99999018','http://localhost:5678/webhook-waiting/99999018?signature=bad'] loop
  begin perform public.worker_create_approval(m,'99999018',u);raise exception 'Unsafe resume binding accepted';exception when others then if sqlerrm='Unsafe resume binding accepted' then raise;end if;end;
 end loop;
 r:=public.worker_create_approval(m,'99999018','http://localhost:5678/webhook-waiting/99999018?signature='||repeat('a',64));if not (r->>'created')::boolean then raise exception 'Valid private signed binding rejected';end if;
end;$$;
rollback;
select 'PASS: private signed Wait adapter' as test_result;
