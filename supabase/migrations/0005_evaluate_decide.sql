-- Slice 3: private fenced evaluation queue/cache, public owned decisions.
begin;
create table public.matches (
 id uuid primary key default gen_random_uuid(), user_id uuid not null,
 opportunity_id uuid not null, status text not null default 'queued' check(status in ('queued','processing','complete','failed')),
 revision bigint not null default 1, claim_token uuid, claimed_until timestamptz, snapshot jsonb,
 next_attempt_at timestamptz not null default now(), retry_count integer not null default 0,
 error_code text, eligibility_status text check(eligibility_status in ('ELIGIBLE','INELIGIBLE','UNKNOWN')),
 eligibility_checks jsonb, component_scores jsonb, match_score numeric check(match_score between 0 and 100),
 confidence numeric check(confidence between 0 and 1), confidence_inputs jsonb, decision text check(decision in ('ACT','ASK','IGNORE')),
 reason_codes text[], explanation text, semantic_evidence jsonb, mode text, policy_version text, match_version text,
 evaluation_day date, decided_at timestamptz, updated_at timestamptz not null default now(),
 unique(user_id,opportunity_id), unique(user_id,id),
 foreign key(user_id,opportunity_id) references public.opportunities(user_id,id) on delete cascade
);
create index matches_queue on public.matches(status,next_attempt_at);
create table public.match_cache (
 user_id uuid not null references auth.users(id) on delete cascade, cache_key text not null check(cache_key ~ '^[0-9a-f]{64}$'),
 status text not null default 'prepared' check(status in ('prepared','running','complete','failed')),
 claim_token uuid, result_json jsonb, error_code text, updated_at timestamptz not null default now(),
 primary key(user_id,cache_key)
);
alter table public.ai_extraction_budget add column running_match_token uuid;
alter table public.matches enable row level security;
alter table public.match_cache enable row level security;
revoke all on public.matches,public.match_cache from public,anon,authenticated;
grant all on public.matches,public.match_cache to service_role;
grant select(id,user_id,opportunity_id,status,error_code,retry_count,eligibility_status,eligibility_checks,component_scores,match_score,confidence,confidence_inputs,decision,reason_codes,explanation,semantic_evidence,mode,policy_version,match_version,evaluation_day,decided_at,updated_at) on public.matches to authenticated;
create policy matches_own on public.matches for select to authenticated using((select auth.uid())=user_id);

-- Compare facts, not quotation formatting, confidence or security annotations.
-- Experience numbers are material even when extraction only normalized a skill name.
create function public.opportunity_material(p_item jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('title',lower(p_item->>'title'),'organization',lower(p_item->>'organization'),'deadline',p_item->'deadline','location',lower(p_item->>'location'),'type',p_item->'type','application_url',p_item->'application_url','skills',(select coalesce(jsonb_agg(v order by v),'[]') from jsonb_array_elements_text(coalesce(p_item->'skills','[]')) v),'requirements',(select coalesce(jsonb_agg(v order by v::text),'[]') from (select jsonb_build_object('kind',r->'kind','value',lower(r->>'value'),'mandatory',r->'mandatory','normalized',r->'normalized_value','experience',case when r->>'evidence' ~* 'experience|years? of|months? of' then regexp_replace(lower(r->>'evidence'),'\s+',' ','g') else null end) v from jsonb_array_elements(coalesce(p_item->'requirements','[]')) r) q));
$$;
-- Recalculate historical source_variation instead of perpetuating warning-only differences.
update public.opportunities o set ambiguity_flags=array(select distinct flag from (select unnest(o.ambiguity_flags) flag union all select jsonb_array_elements_text(coalesce(s.extracted_json->'ambiguity_flags','[]')) from public.opportunity_sources s where s.user_id=o.user_id and s.opportunity_id=o.id) q where flag<>'source_variation') || case when exists(select 1 from public.opportunity_sources s where s.user_id=o.user_id and s.opportunity_id=o.id and public.opportunity_material(s.extracted_json)<>public.opportunity_material(o.extracted_json)) then array['source_variation'] else '{}'::text[] end;

create function public.enqueue_evaluation(p_user uuid,p_opportunity uuid) returns void language plpgsql set search_path='' as $$
begin
 insert into public.matches(user_id,opportunity_id) values(p_user,p_opportunity)
 on conflict(user_id,opportunity_id) do update set revision=public.matches.revision+1,status='queued',claim_token=null,claimed_until=null,snapshot=null,error_code=null,next_attempt_at=now(),retry_count=0,decision=null,decided_at=null,updated_at=now();
end; $$;
create function public.queue_opportunity_evaluation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' or public.opportunity_material(new.extracted_json)<>public.opportunity_material(old.extracted_json) or
   (select coalesce(array_agg(f order by f),'{}') from unnest(new.ambiguity_flags) f where f<>'source_contains_instructions') is distinct from (select coalesce(array_agg(f order by f),'{}') from unnest(old.ambiguity_flags) f where f<>'source_contains_instructions') then
  perform public.enqueue_evaluation(new.user_id,new.id);
 end if;return new;
end; $$;
create trigger queue_opportunity after insert or update on public.opportunities for each row execute function public.queue_opportunity_evaluation();
create function public.queue_profile_evaluations() returns trigger language plpgsql security definer set search_path='' as $$
declare u uuid;
begin
 u:=case when TG_OP='DELETE' then old.user_id else new.user_id end;
 if TG_TABLE_NAME='profiles' and TG_OP='UPDATE' then
  if (to_jsonb(new)-'updated_at'-'display_name')=(to_jsonb(old)-'updated_at'-'display_name') then return new;end if;
 end if;
 perform public.enqueue_evaluation(u,id) from public.opportunities where user_id=u;
 return case when TG_OP='DELETE' then old else new end;
end; $$;
create trigger queue_profile after insert or update on public.profiles for each row execute function public.queue_profile_evaluations();
create trigger queue_skills after insert or update or delete on public.profile_skills for each row execute function public.queue_profile_evaluations();
create function public.queue_requirement_evaluation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then perform public.enqueue_evaluation(old.user_id,old.opportunity_id);return old;end if;
 perform public.enqueue_evaluation(new.user_id,new.opportunity_id);return new;
end; $$;
-- Deleting an opportunity cascades requirements: skip DELETE to avoid resurrecting its match.
create trigger queue_requirement after insert or update on public.opportunity_requirements for each row execute function public.queue_requirement_evaluation();

create function public.claim_evaluation(p_id uuid default null) returns jsonb language plpgsql set search_path='' as $$
declare m public.matches%rowtype; data jsonb; stale public.matches%rowtype; today date:=(now() at time zone 'Asia/Kolkata')::date;
begin
 for stale in select * from public.matches where status='processing' and claimed_until<now() for update skip locked loop
  update public.matches set status='failed',error_code='EVALUATION_INTERRUPTED',claim_token=null,claimed_until=null,updated_at=now() where id=stale.id;
  update public.match_cache set status='failed',error_code='EVALUATION_INTERRUPTED' where user_id=stale.user_id and claim_token=stale.claim_token and status='running';
  insert into public.events(user_id,stage,level,message,metadata) values(stale.user_id,'decide','error','Opportunity evaluation was interrupted',jsonb_build_object('match_id',stale.id));
 end loop;
 select * into m from public.matches where ((status='queued' and next_attempt_at<=now()) or (status='complete' and evaluation_day<today)) and (p_id is null or opportunity_id=p_id) order by next_attempt_at,id limit 1 for update skip locked;
 if not found then return jsonb_build_object('claimed',false);end if;
 select jsonb_build_object('profile',coalesce((select to_jsonb(p)-'user_id'-'display_name'-'updated_at' from public.profiles p where p.user_id=m.user_id),'{}') || jsonb_build_object('skills',coalesce((select jsonb_agg(jsonb_build_object('name',s.canonical_name,'level',ps.level) order by s.canonical_name) from public.profile_skills ps join public.skills s on s.id=ps.skill_id where ps.user_id=m.user_id),'[]')),'opportunity',to_jsonb(o)-'user_id','requirements',coalesce((select jsonb_agg(to_jsonb(r)-'id'-'user_id'-'opportunity_id' order by r.kind,r.value) from public.opportunity_requirements r where r.user_id=m.user_id and r.opportunity_id=m.opportunity_id),'[]')) into data from public.opportunities o where o.id=m.opportunity_id and o.user_id=m.user_id;
 update public.matches set status='processing',claim_token=gen_random_uuid(),claimed_until=now()+interval '10 minutes',snapshot=data,error_code=null,decision=null,decided_at=null,updated_at=now() where id=m.id returning * into m;
 return jsonb_build_object('claimed',true,'match_id',m.id,'opportunity_id',m.opportunity_id,'user_id',m.user_id,'claim_token',m.claim_token,'revision',m.revision,'evaluation_day',today,'input',data);
end; $$;

create function public.register_match_cache(p_id uuid,p_token uuid,p_key text) returns jsonb language plpgsql set search_path='' as $$
declare m public.matches%rowtype; c public.match_cache%rowtype;
begin
 select * into m from public.matches where id=p_id and status='processing' and claim_token=p_token and claimed_until>now() for update;
 if not found then return jsonb_build_object('route','stale');end if;
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

create function public.reserve_match_budget(p_id uuid,p_token uuid,p_key text) returns jsonb language plpgsql set search_path='' as $$
declare m public.matches%rowtype; b public.ai_extraction_budget%rowtype; c public.match_cache%rowtype; v_day date:=(now() at time zone 'America/Los_Angeles')::date;
begin
 select * into m from public.matches where id=p_id and status='processing' and claim_token=p_token and claimed_until>now() for update;
 if not found then return jsonb_build_object('allowed',false,'reason','stale');end if;
 select * into c from public.match_cache where user_id=m.user_id and cache_key=p_key for update;
 if not found or c.status<>'prepared' then return jsonb_build_object('allowed',false,'reason','already_reserved');end if;
 perform pg_advisory_xact_lock(672002);
 insert into public.ai_extraction_budget(day) values(v_day) on conflict do nothing;
 select * into b from public.ai_extraction_budget where day=v_day for update;
 if exists(select 1 from public.ai_extraction_budget where running_until>now()) or b.last_reserved_at>now()-interval '60 seconds' then
  update public.matches set status='queued',claim_token=null,claimed_until=null,next_attempt_at=now()+interval '60 seconds',updated_at=now() where id=m.id;
  return jsonb_build_object('allowed',false,'reason','rate_wait');
 end if;
 if b.reserved_attempts+7>350 then return jsonb_build_object('allowed',false,'reason','QUOTA_LIMIT');end if;
 update public.ai_extraction_budget set reserved_attempts=reserved_attempts+7,last_reserved_at=now(),running_raw_id=null,running_match_token=p_token,running_until=now()+interval '10 minutes' where day=v_day;
 update public.match_cache set status='running',claim_token=p_token,updated_at=now() where user_id=m.user_id and cache_key=p_key;
 return jsonb_build_object('allowed',true);
end; $$;

create function public.store_match_cache(p_user uuid,p_token uuid,p_key text,p_result jsonb) returns jsonb language plpgsql set search_path='' as $$
begin
 update public.match_cache set status='complete',result_json=p_result,error_code=null,updated_at=now() where user_id=p_user and cache_key=p_key and claim_token=p_token and status='running';
 if not found then return jsonb_build_object('stored',false);end if;
 update public.ai_extraction_budget set running_match_token=null,running_until=null where running_match_token=p_token;
 return jsonb_build_object('stored',true);
end; $$;

create function public.finish_evaluation(p_id uuid,p_token uuid,p_revision bigint,p_day date,p_result jsonb) returns jsonb language plpgsql set search_path='' as $$
declare m public.matches%rowtype;
begin
 select * into m from public.matches where id=p_id and status='processing' and claim_token=p_token and revision=p_revision and claimed_until>now() for update;
 if not found then return jsonb_build_object('saved',false,'reason','stale');end if;
 if p_day<>(now() at time zone 'Asia/Kolkata')::date then
  update public.matches set status='queued',claim_token=null,claimed_until=null,next_attempt_at=now(),updated_at=now() where id=m.id;return jsonb_build_object('saved',false,'reason','day_changed');
 end if;
 if p_result->>'decision' is null or p_result->>'decision' not in ('ACT','ASK','IGNORE') or p_result->>'eligibility_status' is null or p_result->>'eligibility_status' not in ('ELIGIBLE','INELIGIBLE','UNKNOWN') or p_result->>'policy_version'<>'decision-v1' then raise exception 'Invalid decision';end if;
 if (p_result->>'decision'='ACT' and (p_result->>'eligibility_status'<>'ELIGIBLE' or (p_result->>'expired')::boolean or p_result->'match_score'='null'::jsonb or p_result->'confidence'='null'::jsonb)) or (p_result->>'eligibility_status'='UNKNOWN' and p_result->>'decision'<>'ASK' and not (p_result->>'expired')::boolean) then raise exception 'Eligibility gate bypass';end if;
 update public.matches set status='complete',eligibility_status=p_result->>'eligibility_status',eligibility_checks=p_result->'eligibility_checks',component_scores=p_result->'component_scores',match_score=(p_result->>'match_score')::numeric,confidence=(p_result->>'confidence')::numeric,confidence_inputs=p_result->'confidence_inputs',decision=p_result->>'decision',reason_codes=array(select jsonb_array_elements_text(p_result->'reason_codes')),explanation=p_result->>'explanation',semantic_evidence=p_result->'semantic_evidence',mode=p_result->>'mode',policy_version=p_result->>'policy_version',match_version=p_result->>'match_version',evaluation_day=p_day,decided_at=now(),claim_token=null,claimed_until=null,error_code=null,updated_at=now() where id=m.id;
 insert into public.events(user_id,stage,level,message,metadata) values(m.user_id,'decide','info','Decision: '||(p_result->>'decision'),jsonb_build_object('opportunity_id',m.opportunity_id,'match_id',m.id,'decision',p_result->>'decision','eligibility',p_result->>'eligibility_status','score',p_result->'match_score','policy_version',p_result->>'policy_version'));
 return jsonb_build_object('saved',true,'decision',p_result->>'decision','match_id',m.id);
end; $$;

create function public.fail_evaluation(p_id uuid,p_token uuid,p_key text,p_error text) returns jsonb language plpgsql set search_path='' as $$
declare m public.matches%rowtype; u uuid;
begin
 select * into m from public.matches where id=p_id and status='processing' and claim_token=p_token for update;
 if p_error not in ('INVALID_MATCH','AI_UNAVAILABLE','QUOTA_LIMIT','EVALUATION_INTERRUPTED') then p_error:='AI_UNAVAILABLE';end if;
 if found then
  update public.matches set status='failed',decision=null,error_code=p_error,claim_token=null,claimed_until=null,updated_at=now() where id=m.id;
  insert into public.events(user_id,stage,level,message,metadata) values(m.user_id,'decide','error','Opportunity evaluation needs attention',jsonb_build_object('opportunity_id',m.opportunity_id,'error_code',p_error));
 end if;
 update public.match_cache set status='failed',error_code=p_error,updated_at=now() where cache_key=p_key and claim_token=p_token and status='running';
 update public.ai_extraction_budget set running_match_token=null,running_until=null where running_match_token=p_token;
 return jsonb_build_object('failed',m.id is not null);
end; $$;
create function public.retry_evaluation(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare m public.matches%rowtype;
begin
 select * into m from public.matches where opportunity_id=p_id and user_id=auth.uid() and status='failed' for update;
 if not found then raise exception 'Failed evaluation not found';end if;
 if m.retry_count>=2 then raise exception 'Retry limit reached';end if;
 update public.match_cache set status='prepared',error_code=null,claim_token=null where user_id=m.user_id and status='failed';
 update public.matches set status='queued',error_code=null,decision=null,next_attempt_at=now(),retry_count=retry_count+1,revision=revision+1,updated_at=now() where id=m.id;
 insert into public.events(user_id,stage,level,message,metadata) values(m.user_id,'decide','info','Evaluation retry requested',jsonb_build_object('opportunity_id',p_id));
end; $$;
create function public.save_autonomy_mode(p_mode text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_mode is null or p_mode not in ('cautious','balanced','autopilot') then raise exception 'Invalid autonomy mode';end if;
 update public.profiles set autonomy_mode=p_mode,updated_at=now() where user_id=auth.uid();
 if not found then raise exception 'Save a profile first';end if;
 insert into public.events(user_id,stage,level,message) values(auth.uid(),'profile','info','Autonomy mode updated to '||p_mode);
end; $$;

revoke all on function public.opportunity_material(jsonb),public.enqueue_evaluation(uuid,uuid),public.queue_opportunity_evaluation(),public.queue_profile_evaluations(),public.queue_requirement_evaluation(),public.claim_evaluation(uuid),public.register_match_cache(uuid,uuid,text),public.reserve_match_budget(uuid,uuid,text),public.store_match_cache(uuid,uuid,text,jsonb),public.finish_evaluation(uuid,uuid,bigint,date,jsonb),public.fail_evaluation(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.opportunity_material(jsonb),public.enqueue_evaluation(uuid,uuid),public.claim_evaluation(uuid),public.register_match_cache(uuid,uuid,text),public.reserve_match_budget(uuid,uuid,text),public.store_match_cache(uuid,uuid,text,jsonb),public.finish_evaluation(uuid,uuid,bigint,date,jsonb),public.fail_evaluation(uuid,uuid,text,text) to service_role;
revoke all on function public.retry_evaluation(uuid),public.save_autonomy_mode(text) from public,anon;
grant execute on function public.retry_evaluation(uuid),public.save_autonomy_mode(text) to authenticated;
insert into public.matches(user_id,opportunity_id) select user_id,id from public.opportunities;
alter publication supabase_realtime add table public.matches;
commit;
