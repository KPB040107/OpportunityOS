-- Compare material source facts while keeping verified warning annotations.
begin;
create or replace function public.finish_understand_item(p_id uuid,p_token uuid,p_result jsonb) returns jsonb language plpgsql set search_path='' as $$
declare r public.raw_items%rowtype; item jsonb; req jsonb; v_opp uuid; ids jsonb:='[]'; existing jsonb;
begin
  select * into r from public.raw_items where id=p_id and status='processing' and claim_token=p_token and claimed_until>now() for update;
  if not found then raise exception 'Stale claim'; end if;
  if jsonb_typeof(p_result->'is_opportunity')<>'boolean' or jsonb_typeof(p_result->'items')<>'array' or jsonb_array_length(p_result->'items')>5 then raise exception 'Invalid extraction'; end if;
  for item in select value from jsonb_array_elements(p_result->'items') loop
    insert into public.opportunities(user_id,fingerprint,title,organization,deadline,location,type,application_url,description,skills,ambiguity_flags,extracted_json,extraction_confidence,extraction_version)
    values(r.user_id,item->>'fingerprint',item->>'title',item->>'organization',nullif(item->>'deadline','')::date,item->>'location',item->>'type',item->>'application_url',item->>'description',array(select jsonb_array_elements_text(item->'skills')),array(select jsonb_array_elements_text(item->'ambiguity_flags')),item,(item->>'confidence')::numeric,p_result->>'extraction_version')
    on conflict(user_id,fingerprint) do nothing returning id into v_opp;
    if v_opp is null then
      select id,extracted_json into v_opp,existing from public.opportunities where user_id=r.user_id and fingerprint=item->>'fingerprint';
      -- Keep each version in provenance; conflicting sources must not silently overwrite facts.
      if public.opportunity_material(existing) <> public.opportunity_material(item) then
        update public.opportunities set ambiguity_flags=array(select distinct x from unnest(ambiguity_flags||array(select jsonb_array_elements_text(item->'ambiguity_flags'))||array['source_variation']) x),updated_at=now() where user_id=r.user_id and id=v_opp;
      end if;
      update public.opportunities set ambiguity_flags=array(select distinct x from unnest(ambiguity_flags||array(select jsonb_array_elements_text(item->'ambiguity_flags'))) x) where id=v_opp and user_id=r.user_id;
    else
      for req in select value from jsonb_array_elements(item->'requirements') loop
        insert into public.opportunity_requirements(user_id,opportunity_id,kind,value,normalized_value,mandatory,evidence_snippet) values(r.user_id,v_opp,req->>'kind',req->>'value',req->'normalized_value',(req->>'mandatory')::boolean,req->>'evidence');
      end loop;
    end if;
    insert into public.opportunity_sources(user_id,opportunity_id,raw_item_id,extracted_json) values(r.user_id,v_opp,r.id,item) on conflict do nothing;
    ids:=ids||jsonb_build_array(v_opp); v_opp:=null;
  end loop;
  update public.extraction_cache set status='complete',result_json=p_result,error_code=null,updated_at=now() where user_id=r.user_id and content_hash=coalesce(r.content_hash,(select content_hash from public.raw_items where id=r.duplicate_of)) and version='extract-v1';
  update public.raw_items set status='understood',is_opportunity=(p_result->>'is_opportunity')::boolean,error_code=null,claim_token=null,claimed_until=null,updated_at=now() where id=r.id;
  update public.ai_extraction_budget set running_raw_id=null,running_until=null where running_raw_id=r.id;
  insert into public.events(user_id,stage,level,message,metadata) values(r.user_id,'understand','info',case when r.duplicate_of is not null then 'Repeated content reused existing analysis' when (p_result->>'is_opportunity')::boolean then 'Opportunity details extracted' else 'Submission is not an opportunity' end,jsonb_build_object('raw_item_id',r.id,'opportunity_ids',ids));
  return jsonb_build_object('saved',true,'opportunity_ids',ids);
end; $$;

alter table public.matches add column cache_key text;
create or replace function public.register_match_cache(p_id uuid,p_token uuid,p_key text) returns jsonb language plpgsql set search_path='' as $$
declare m public.matches%rowtype; c public.match_cache%rowtype;
begin
 select * into m from public.matches where id=p_id and status='processing' and claim_token=p_token and claimed_until>now() for update;
 if not found then return jsonb_build_object('route','stale');end if;
 update public.matches set cache_key=p_key where id=m.id;
 if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'Invalid match cache key';end if;
 insert into public.match_cache(user_id,cache_key) values(m.user_id,p_key) on conflict do nothing;
 select * into c from public.match_cache where user_id=m.user_id and cache_key=p_key for update;
 if c.status='complete' then return jsonb_build_object('route','cached','result',c.result_json);end if;
 if c.status='failed' then return jsonb_build_object('route','failed','error_code',c.error_code);end if;
 if c.status='running' then
  update public.matches set status='queued',claim_token=null,claimed_until=null,next_attempt_at=now()+interval '60 seconds',updated_at=now() where id=m.id;
  return jsonb_build_object('route','waiting');
 end if;
 return jsonb_build_object('route','new');
end; $$;
create or replace function public.retry_evaluation(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare m public.matches%rowtype;
begin
 select * into m from public.matches where opportunity_id=p_id and user_id=auth.uid() and status='failed' for update;
 if not found then raise exception 'Failed evaluation not found';end if;
 if m.retry_count>=2 then raise exception 'Retry limit reached';end if;
 update public.match_cache set status='prepared',error_code=null,claim_token=null where user_id=m.user_id and cache_key=m.cache_key and status='failed';
 update public.matches set status='queued',error_code=null,decision=null,next_attempt_at=now(),retry_count=retry_count+1,revision=revision+1,updated_at=now() where id=m.id;
 insert into public.events(user_id,stage,level,message,metadata) values(m.user_id,'decide','info','Evaluation retry requested',jsonb_build_object('opportunity_id',p_id));
end; $$;
commit;
