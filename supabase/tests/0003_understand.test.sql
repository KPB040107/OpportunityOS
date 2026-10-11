-- Disposable users and test rows roll back, including quota reservations.
begin;
select set_config('opportunityos.test_a',gen_random_uuid()::text,true);
select set_config('opportunityos.test_b',gen_random_uuid()::text,true);
insert into auth.users(id,email) values
 (current_setting('opportunityos.test_a')::uuid,'slice2-a-'||current_setting('opportunityos.test_a')||'@example.invalid'),
 (current_setting('opportunityos.test_b')::uuid,'slice2-b-'||current_setting('opportunityos.test_b')||'@example.invalid');
do $$
declare a uuid:=current_setting('opportunityos.test_a')::uuid; b uuid:=current_setting('opportunityos.test_b')::uuid; first_id uuid; second_id uuid; third_id uuid; c jsonb; r jsonb; result jsonb; opp uuid; v_hash text:=repeat('a',64);
begin
 select raw_item_id into first_id from public.ingest_raw_item(a,gen_random_uuid(),'text','SETUP TEST - Software internship');
 c:=public.claim_understand_item(first_id);
 if not (c->>'claimed')::boolean then raise exception 'Claim failed'; end if;
 if (public.claim_understand_item(first_id)->>'claimed')::boolean then raise exception 'Concurrent claim accepted'; end if;
 r:=public.register_understand_content(first_id,(c->>'claim_token')::uuid,v_hash,'SETUP TEST - Software internship',null,null);
 if r->>'route'<>'new' then raise exception 'New content not recognised'; end if;
 result:='{"is_opportunity":true,"extraction_version":"extract-v1","items":[{"fingerprint":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","title":"Software internship","organization":null,"deadline":null,"location":null,"type":"internship","application_url":null,"description":null,"skills":["python"],"ambiguity_flags":["missing_deadline"],"confidence":0.8,"requirements":[{"kind":"skill","value":"Python","normalized_value":{"name":"python"},"mandatory":false,"evidence":"Python"}],"evidence":[{"field":"title","quote":"Software internship"}]}]}'::jsonb;
 begin
  perform public.finish_understand_item(first_id,gen_random_uuid(),result);
  raise exception 'Stale claim accepted';
 exception when raise_exception then if SQLERRM<>'Stale claim' then raise;end if;end;
 r:=public.finish_understand_item(first_id,(c->>'claim_token')::uuid,result);
 opp:=(r->'opportunity_ids'->>0)::uuid;
 select raw_item_id into second_id from public.ingest_raw_item(a,gen_random_uuid(),'text','SETUP TEST - Software internship');
 c:=public.claim_understand_item(second_id);
 r:=public.register_understand_content(second_id,(c->>'claim_token')::uuid,v_hash,'SETUP TEST - Software internship',null,null);
 if r->>'route'<>'cached' or (select status from public.raw_items where id=second_id)<>'understood' then raise exception 'Cached content reached extraction'; end if;
 if (select count(*) from public.opportunities where user_id=a)<>1 or (select count(*) from public.opportunity_sources where user_id=a)<>2 then raise exception 'Duplicate canonical opportunity or missing provenance'; end if;
 select raw_item_id into third_id from public.ingest_raw_item(a,gen_random_uuid(),'text','SETUP TEST - Different source, same opportunity');
 c:=public.claim_understand_item(third_id);
 perform public.register_understand_content(third_id,(c->>'claim_token')::uuid,repeat('c',64),'SETUP TEST - Different source, same opportunity',null,null);
 result:=jsonb_set(result,'{items,0,ambiguity_flags}','["missing_deadline","source_contains_instructions"]'::jsonb);
 perform public.finish_understand_item(third_id,(c->>'claim_token')::uuid,result);
 if (select count(*) from public.opportunities where user_id=a)<>1 or (select count(*) from public.opportunity_sources where user_id=a)<>3 then raise exception 'Fingerprint deduplication failed';end if;
 if not (select 'source_contains_instructions'=any(ambiguity_flags) from public.opportunities where id=opp) then raise exception 'Merged source warning was lost';end if;
 select raw_item_id into second_id from public.ingest_raw_item(b,gen_random_uuid(),'text','SETUP TEST - Cross-owner provenance');
 begin
  insert into public.opportunity_sources(user_id,opportunity_id,raw_item_id,extracted_json) values(b,opp,second_id,result);
  raise exception 'Cross-user related row accepted';
 exception when foreign_key_violation then null;end;
 if has_function_privilege('authenticated','public.claim_understand_item(uuid)','execute') or has_function_privilege('authenticated','public.finish_understand_item(uuid,uuid,jsonb)','execute') then raise exception 'Browser has worker privileges';end if;
 select raw_item_id into first_id from public.ingest_raw_item(b,gen_random_uuid(),'text','SETUP TEST - Quota fixture');
 c:=public.claim_understand_item(first_id);
 perform public.register_understand_content(first_id,(c->>'claim_token')::uuid,repeat('d',64),'SETUP TEST - Quota fixture',null,null);
 insert into public.ai_extraction_budget(day,reserved_attempts) values((now() at time zone 'America/Los_Angeles')::date,350) on conflict(day) do update set reserved_attempts=350,last_reserved_at=null,running_raw_id=null,running_until=null;
 update public.ai_extraction_budget set running_until=null;
 r:=public.reserve_extraction_budget(first_id,(c->>'claim_token')::uuid);
 if (r->>'allowed')::boolean or r->>'reason'<>'QUOTA_LIMIT' then raise exception 'Exhausted quota accepted';end if;
 perform public.fail_understand_item(first_id,(c->>'claim_token')::uuid,'QUOTA_LIMIT');
 if (select status from public.raw_items where id=first_id)<>'failed' then raise exception 'Failure not preserved';end if;
 perform set_config('opportunityos.failed_b',first_id::text,true);
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('opportunityos.test_a'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.opportunities)<>1 or (select count(*) from public.opportunity_requirements)<>1 or (select count(*) from public.opportunity_sources)<>3 then raise exception 'Own rows unavailable';end if;
 begin perform public.retry_understand_item(current_setting('opportunityos.failed_b')::uuid);raise exception 'Cross-user retry accepted';exception when raise_exception then if SQLERRM<>'Failed submission not found' then raise;end if;end;
 begin perform claimed_until from public.raw_items;raise exception 'Internal claims leaked';exception when insufficient_privilege then null;end;
 begin perform * from public.ai_extraction_budget;raise exception 'Private budget leaked';exception when insufficient_privilege then null;end;
 begin insert into public.opportunities(user_id,fingerprint,type,extracted_json,extraction_confidence,extraction_version) values(auth.uid(),repeat('f',64),'job','{}',1,'fake');raise exception 'Browser forged extracted facts';exception when insufficient_privilege then null;end;
end; $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('opportunityos.test_b'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.opportunities)<>0 or (select count(*) from public.opportunity_requirements)<>0 or (select count(*) from public.opportunity_sources)<>0 then raise exception 'Opportunity data leaked';end if;
 perform public.retry_understand_item(current_setting('opportunityos.failed_b')::uuid);
 if (select status from public.raw_items where id=current_setting('opportunityos.failed_b')::uuid)<>'queued' then raise exception 'Own retry failed';end if;
end; $$;
reset role;
rollback;
select 'PASS: durable claims, content cache, fingerprint dedupe, provenance ownership, quota exhaustion and controlled retries' as test_result;
