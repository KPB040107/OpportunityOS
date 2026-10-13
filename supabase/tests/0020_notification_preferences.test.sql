-- Consent revocation must stop pending mail, without unnecessary reevaluation.
begin;
select set_config('opportunityos.consent_u',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('opportunityos.consent_u')::uuid,'consent-'||current_setting('opportunityos.consent_u')||'@example.invalid');
insert into public.profiles(user_id) values(current_setting('opportunityos.consent_u')::uuid);
update opportunityos_private.settings set value=current_setting('opportunityos.consent_u') where key='demo_user_id';
insert into public.opportunities(user_id,fingerprint,title,deadline,type,extracted_json,extraction_confidence,extraction_version) values(current_setting('opportunityos.consent_u')::uuid,repeat('b',64),'DEMO Consent',current_date+7,'internship','{}',.9,'extract-v1');
update public.matches set status='complete',decision='ACT',eligibility_status='ELIGIBLE',evaluation_day=(now() at time zone 'Asia/Kolkata')::date,explanation='DEMO consent test' where user_id=current_setting('opportunityos.consent_u')::uuid;
do $$ declare m uuid;r bigint;j uuid;c jsonb;begin
 select id,revision into m,r from public.matches where user_id=current_setting('opportunityos.consent_u')::uuid;
 if (public.worker_match_context(m)->>'email_enabled')::boolean then raise exception 'Demo bypassed email opt-out';end if;
 update public.profiles set notifications_enabled=true where user_id=current_setting('opportunityos.consent_u')::uuid;
 if (select revision from public.matches where id=m)<>r then raise exception 'Preference edit invalidated matching';end if;
 j:=public.worker_queue_action(m,'email_notification');if j is null then raise exception 'Opt-in did not queue notification';end if;
 update public.profiles set notifications_enabled=false where user_id=current_setting('opportunityos.consent_u')::uuid;
 c:=public.worker_claim_action(j);if coalesce((c->>'claimed')::boolean,false) or (select status from public.actions where id=j)<>'blocked' then raise exception 'Opt-out failed to stop pending email';end if;
end;$$;
rollback;
select 'PASS: email consent and preference-only updates' as test_result;
