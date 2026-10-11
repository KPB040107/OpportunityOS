-- Run in the SQL Editor as postgres. All test users and rows are rolled back.
begin;
select set_config('opportunityos.test_a',gen_random_uuid()::text,true);
select set_config('opportunityos.test_b',gen_random_uuid()::text,true);
insert into auth.users(id,email) values
  (current_setting('opportunityos.test_a')::uuid,'slice1-a-'||current_setting('opportunityos.test_a')||'@example.invalid'),
  (current_setting('opportunityos.test_b')::uuid,'slice1-b-'||current_setting('opportunityos.test_b')||'@example.invalid');
do $$
declare v_user uuid:=current_setting('opportunityos.test_a')::uuid; v_request uuid:=gen_random_uuid(); v_first uuid; v_second uuid; v_created boolean;
begin
  select raw_item_id into v_first from public.ingest_raw_item(v_user,v_request,'text','Explicit Slice 1 test fixture');
  select raw_item_id,was_created into v_second,v_created from public.ingest_raw_item(v_user,v_request,'text','Explicit Slice 1 test fixture');
  if v_first<>v_second or v_created then raise exception 'Retry created another item'; end if;
  if (select count(*) from public.events where user_id=v_user and stage='ingest')<>1 then raise exception 'Retry duplicated activity'; end if;
  begin
    perform public.ingest_raw_item(v_user,v_request,'text','Different content');
    raise exception 'Changed content reused the request ID';
  exception when raise_exception then
    if SQLERRM<>'Request identifier already used for different content' then raise; end if;
  end;
  if has_function_privilege('authenticated','public.ingest_raw_item(uuid,uuid,text,text)','execute') then raise exception 'Browser may impersonate an owner'; end if;
end; $$;
select * from public.ingest_raw_item(current_setting('opportunityos.test_b')::uuid,gen_random_uuid(),'text','Other user fixture');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('opportunityos.test_a'),'role','authenticated')::text,true);
set local role authenticated;
select public.save_profile('{"display_name":"Slice 1 test","degree":"B.Tech","cgpa":8.2,"interest_types":["internship"],"preferred_locations":["Remote"]}'::jsonb,'[{"name":"Python","level":"intermediate"}]'::jsonb);
do $$ begin
  if (select count(*) from public.raw_items)<>1 then raise exception 'Raw items leaked between users'; end if;
  if (select count(*) from public.profiles)<>1 then raise exception 'Profile save failed'; end if;
  if (select count(*) from public.profile_skills)<>1 then raise exception 'Skill save failed'; end if;
  if (select count(*) from public.events)<>2 then raise exception 'Activity leaked between users'; end if;
  begin
    perform public.save_profile(jsonb_build_object('user_id',current_setting('opportunityos.test_b')),'[]'::jsonb);
    raise exception 'Ownership claim was accepted';
  exception when raise_exception then
    if SQLERRM<>'Ownership fields are forbidden' then raise; end if;
  end;
  begin
    insert into public.events(user_id,stage,level,message) values(auth.uid(),'test','info','Forged event');
    raise exception 'Activity forgery was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.raw_items(user_id,request_id,source_type,raw_content) values(auth.uid(),gen_random_uuid(),'text','Bypassed n8n');
    raise exception 'Browser bypassed n8n';
  exception when insufficient_privilege then null;
  end;
end; $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('opportunityos.test_b'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.profiles)<>0 or (select count(*) from public.profile_skills)<>0 then raise exception 'Other user profile or skills leaked'; end if;
  if (select count(*) from public.raw_items)<>1 or (select count(*) from public.events)<>1 then raise exception 'Other user records leaked'; end if;
end; $$;
reset role;
rollback;
select 'PASS: profile ownership, related records, activity, retries, and write permissions' as test_result;
