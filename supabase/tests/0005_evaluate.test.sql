-- All fixtures, cache entries, decisions and budget reservations roll back.
begin;
select set_config('opportunityos.eval_a',gen_random_uuid()::text,true);
select set_config('opportunityos.eval_b',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('opportunityos.eval_a')::uuid,'eval-a-'||current_setting('opportunityos.eval_a')||'@example.invalid'),(current_setting('opportunityos.eval_b')::uuid,'eval-b-'||current_setting('opportunityos.eval_b')||'@example.invalid');
insert into public.profiles(user_id,cgpa,graduation_year) values(current_setting('opportunityos.eval_a')::uuid,8.2,2028),(current_setting('opportunityos.eval_b')::uuid,7,2027);
insert into public.opportunities(user_id,fingerprint,title,type,extracted_json,extraction_confidence,extraction_version) values(current_setting('opportunityos.eval_a')::uuid,repeat('1',64),'DEMO evaluation fixture','internship','{"skills":[],"requirements":[]}',.9,'extract-v1');
select set_config('opportunityos.eval_opp',(select id::text from public.opportunities where user_id=current_setting('opportunityos.eval_a')::uuid),true);
do $$
declare a uuid:=current_setting('opportunityos.eval_a')::uuid; b uuid:=current_setting('opportunityos.eval_b')::uuid; opp uuid:=current_setting('opportunityos.eval_opp')::uuid; c jsonb; old_c jsonb; r jsonb; result jsonb; mid uuid; key text:=repeat('d',64); today date:=(now() at time zone 'Asia/Kolkata')::date;
begin
 if public.opportunity_material('{"title":"DEMO","skills":[],"requirements":[]}'::jsonb)<>public.opportunity_material('{"title":"DEMO","skills":[],"ambiguity_flags":["source_contains_instructions"],"requirements":[{"kind":"location","value":"Remote","mandatory":false,"normalized_value":{"name":"remote"}}]}'::jsonb) then raise exception 'Security annotation or redundant soft context became a material conflict';end if;
 if public.opportunity_material('{"location":"Bangalore"}'::jsonb)<>public.opportunity_material('{"location":"Bangalore","normalized_location":"bengaluru"}'::jsonb) then raise exception 'Historical location alias became a material conflict';end if;
 if public.opportunity_material('{"title":"DEMO","requirements":[{"kind":"cgpa","value":"7.5","mandatory":true,"normalized_value":{"minimum":7.5,"scale":10}}]}'::jsonb)=public.opportunity_material('{"title":"DEMO","requirements":[{"kind":"cgpa","value":"9","mandatory":true,"normalized_value":{"minimum":9,"scale":10}}]}'::jsonb) then raise exception 'Real hard constraint conflict was discarded';end if;
 if (select count(*) from public.matches where user_id=a)<>1 then raise exception 'Opportunity not queued';end if;
 c:=public.claim_evaluation(opp);old_c:=c;mid:=(c->>'match_id')::uuid;
 if not (c->>'claimed')::boolean or (public.claim_evaluation(opp)->>'claimed')::boolean then raise exception 'Atomic claim failed';end if;
 if c->'input'->'profile' ? 'user_id' or c->'input'->'profile' ? 'display_name' then raise exception 'Unnecessary identity in profile snapshot';end if;
 result:='{"policy_version":"decision-v1","match_version":"match-v1","eligibility_status":"UNKNOWN","eligibility_checks":[],"component_scores":null,"match_score":null,"confidence":null,"confidence_inputs":null,"decision":"ASK","reason_codes":["UNKNOWN_ELIGIBILITY"],"explanation":"DEMO missing deadline","semantic_evidence":[],"expired":false,"mode":"balanced"}';
 -- Profile changes must fence an in-flight run, including otherwise-valid results.
 update public.profiles set cgpa=8.3 where user_id=a;
 r:=public.finish_evaluation(mid,(c->>'claim_token')::uuid,(c->>'revision')::bigint,today,result);
 if (r->>'saved')::boolean then raise exception 'Stale profile decision saved';end if;
 c:=public.claim_evaluation(opp);
 r:=public.register_match_cache(mid,(c->>'claim_token')::uuid,key);
 if r->>'route'<>'new' then raise exception 'Unexpected cache route';end if;
 -- Match and extraction share the same ceiling, and cannot reserve concurrently.
 update public.ai_extraction_budget set running_until=null;
 insert into public.ai_extraction_budget(day,reserved_attempts,last_reserved_at) values((now() at time zone 'America/Los_Angeles')::date,350,null) on conflict(day) do update set reserved_attempts=350,last_reserved_at=null,running_until=null;
 r:=public.reserve_match_budget(mid,(c->>'claim_token')::uuid,key);
 if (r->>'allowed')::boolean or r->>'reason'<>'QUOTA_LIMIT' then raise exception 'Matching exceeded quota';end if;
 update public.ai_extraction_budget set reserved_attempts=0,last_reserved_at=null where day=(now() at time zone 'America/Los_Angeles')::date;
 r:=public.reserve_match_budget(mid,(c->>'claim_token')::uuid,key);
 if not (r->>'allowed')::boolean then raise exception 'Matching budget reservation failed';end if;
 r:=public.reserve_match_budget(mid,(c->>'claim_token')::uuid,key);
 if (r->>'allowed')::boolean then raise exception 'Duplicate AI reservation';end if;
 if (select reserved_attempts from public.ai_extraction_budget where day=(now() at time zone 'America/Los_Angeles')::date)<>7 then raise exception 'SDK retries not reserved once';end if;
 r:=public.store_match_cache(a,(c->>'claim_token')::uuid,key,'{"skill_fit":0,"career_alignment":0,"interest_fit":0,"confidence":0.8,"evidence":[]}');
 if not (r->>'stored')::boolean then raise exception 'Cache result lost';end if;
 r:=public.register_match_cache(mid,(c->>'claim_token')::uuid,key);
 if r->>'route'<>'cached' then raise exception 'Cache hit reached AI';end if;
 r:=public.finish_evaluation(mid,(c->>'claim_token')::uuid,(c->>'revision')::bigint,today,result);
 if not (r->>'saved')::boolean then raise exception 'Current decision not saved';end if;
 if (public.finish_evaluation(mid,(c->>'claim_token')::uuid,(c->>'revision')::bigint,today,result)->>'saved')::boolean then raise exception 'Decision replay accepted';end if;
 update public.profiles set autonomy_mode='autopilot' where user_id=a;
 c:=public.claim_evaluation(opp);
 if public.register_match_cache(mid,(c->>'claim_token')::uuid,key)->>'route'<>'cached' then raise exception 'Mode change repeated AI';end if;
 begin
  perform public.finish_evaluation(mid,(c->>'claim_token')::uuid,(c->>'revision')::bigint,today,jsonb_set(result,'{decision}','"ACT"'));
  raise exception 'UNKNOWN became ACT';
 exception when raise_exception then if SQLERRM<>'Eligibility gate bypass' then raise;end if;end;
 perform public.fail_evaluation(mid,(c->>'claim_token')::uuid,key,'INVALID_MATCH');
 if (select decision from public.matches where id=mid) is not null or (select status from public.matches where id=mid)<>'failed' then raise exception 'Failed matching fabricated decision';end if;
 begin
  insert into public.matches(user_id,opportunity_id) values(b,opp);raise exception 'Cross-user match accepted';
 exception when foreign_key_violation then null;end;
 if has_function_privilege('authenticated','public.claim_evaluation(uuid)','execute') or has_function_privilege('authenticated','public.finish_evaluation(uuid,uuid,bigint,date,jsonb)','execute') then raise exception 'Browser worker privilege';end if;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('opportunityos.eval_b'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.matches) then raise exception 'Cross-user decisions leaked';end if;
 begin perform public.retry_evaluation(current_setting('opportunityos.eval_opp')::uuid);raise exception 'Cross-user retry accepted';exception when raise_exception then if SQLERRM<>'Failed evaluation not found' then raise;end if;end;
 begin perform * from public.match_cache;raise exception 'Private AI cache leaked';exception when insufficient_privilege then null;end;
 begin perform claim_token from public.matches;raise exception 'Claim secret leaked';exception when insufficient_privilege then null;end;
 begin insert into public.matches(user_id,opportunity_id) values(auth.uid(),current_setting('opportunityos.eval_opp')::uuid);raise exception 'Browser forged a decision';exception when insufficient_privilege then null;end;
end; $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('opportunityos.eval_a'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.matches)<>1 then raise exception 'Own decision unavailable';end if;
 perform public.retry_evaluation(current_setting('opportunityos.eval_opp')::uuid);
 if (select status from public.matches)<>'queued' then raise exception 'Own retry not queued';end if;
 perform public.save_autonomy_mode('cautious');
 if (select autonomy_mode from public.profiles where user_id=auth.uid())<>'cautious' then raise exception 'Mode not saved';end if;
 begin perform public.save_autonomy_mode('dangerous');raise exception 'Invalid mode accepted';exception when raise_exception then if SQLERRM<>'Invalid autonomy mode' then raise;end if;end;
end; $$;
reset role;
do $$
declare a uuid:=current_setting('opportunityos.eval_a')::uuid;opp uuid:=current_setting('opportunityos.eval_opp')::uuid;c jsonb;r jsonb;key text:=repeat('e',64);
begin
 c:=public.claim_evaluation(opp);
 insert into public.match_cache(user_id,cache_key,status,claim_token,running_until) values(a,key,'running',gen_random_uuid(),now()-interval '1 second');
 r:=public.register_match_cache((c->>'match_id')::uuid,(c->>'claim_token')::uuid,key);
 if r->>'route'<>'failed' or r->>'error_code'<>'EVALUATION_INTERRUPTED' then raise exception 'Expired AI cache waits forever';end if;
 perform public.fail_evaluation((c->>'match_id')::uuid,(c->>'claim_token')::uuid,key,'EVALUATION_INTERRUPTED');
end; $$;
rollback;
select 'PASS: evaluation claims, stale profile fencing, quota, cache reuse, replay, ownership, private columns, retries and modes' as test_result;
