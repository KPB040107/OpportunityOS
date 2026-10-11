-- Slice 2: durable claims, content cache, validated opportunities and provenance.
begin;
alter table public.raw_items add column if not exists content_hash text;
alter table public.raw_items add column if not exists cleaned_text text;
alter table public.raw_items add column if not exists final_url text;
alter table public.raw_items add column if not exists fetched_at timestamptz;
alter table public.raw_items add column if not exists is_opportunity boolean;
alter table public.raw_items add column if not exists duplicate_of uuid;
alter table public.raw_items add column if not exists claim_token uuid;
alter table public.raw_items add column if not exists claimed_until timestamptz;
alter table public.raw_items add column if not exists next_attempt_at timestamptz not null default now();
alter table public.raw_items add column if not exists retry_count integer not null default 0;
create unique index if not exists raw_items_owner_id on public.raw_items(user_id,id);
create unique index if not exists raw_items_owner_hash on public.raw_items(user_id,content_hash) where content_hash is not null;
alter table public.raw_items add constraint raw_duplicate_owner_fk foreign key(user_id,duplicate_of) references public.raw_items(user_id,id);
create table public.extraction_cache (
  user_id uuid not null references auth.users(id) on delete cascade,
  content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
  version text not null,
  raw_item_id uuid not null,
  status text not null check(status in ('prepared','extracting','complete','failed')),
  result_json jsonb,
  error_code text,
  updated_at timestamptz not null default now(),
  primary key(user_id,content_hash,version),
  foreign key(user_id,raw_item_id) references public.raw_items(user_id,id) on delete cascade
);
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
  title text, organization text, deadline date, location text,
  type text not null check(type in ('internship','hackathon','scholarship','program','job','unknown')),
  application_url text, description text,
  skills text[] not null default '{}',
  ambiguity_flags text[] not null default '{}',
  extracted_json jsonb not null,
  extraction_confidence numeric not null check(extraction_confidence between 0 and 1),
  extraction_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,fingerprint), unique(user_id,id)
);
create table public.opportunity_sources (
  user_id uuid not null,
  opportunity_id uuid not null,
  raw_item_id uuid not null,
  extracted_json jsonb not null,
  first_seen_at timestamptz not null default now(),
  primary key(opportunity_id,raw_item_id),
  foreign key(user_id,opportunity_id) references public.opportunities(user_id,id) on delete cascade,
  foreign key(user_id,raw_item_id) references public.raw_items(user_id,id) on delete cascade
);
create table public.opportunity_requirements (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  opportunity_id uuid not null,
  kind text not null check(kind in ('cgpa','academic_year','graduation_year','branch','degree','location','skill','other')),
  value text not null, normalized_value jsonb,
  mandatory boolean not null, evidence_snippet text not null,
  foreign key(user_id,opportunity_id) references public.opportunities(user_id,id) on delete cascade
);
-- Private global guard: conservative reservations cover SDK-level retries.
create table public.ai_extraction_budget (
  day date primary key, reserved_attempts integer not null default 0,
  last_reserved_at timestamptz, running_raw_id uuid, running_until timestamptz
);
alter table public.extraction_cache enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_sources enable row level security;
alter table public.opportunity_requirements enable row level security;
alter table public.ai_extraction_budget enable row level security;
revoke all on public.extraction_cache,public.opportunities,public.opportunity_sources,public.opportunity_requirements,public.ai_extraction_budget from public,anon,authenticated;
grant all on public.extraction_cache,public.opportunities,public.opportunity_sources,public.opportunity_requirements,public.ai_extraction_budget to service_role;
grant select on public.opportunities,public.opportunity_sources,public.opportunity_requirements to authenticated;
create policy opportunities_own on public.opportunities for select to authenticated using ((select auth.uid())=user_id);
create policy opportunity_sources_own on public.opportunity_sources for select to authenticated using ((select auth.uid())=user_id);
create policy opportunity_requirements_own on public.opportunity_requirements for select to authenticated using ((select auth.uid())=user_id);
revoke select on public.raw_items from authenticated;
grant select(id,user_id,request_id,source_type,raw_content,status,error_code,created_at,updated_at,content_hash,cleaned_text,final_url,fetched_at,is_opportunity,duplicate_of,retry_count) on public.raw_items to authenticated;

create function public.claim_understand_item(p_id uuid default null) returns jsonb language plpgsql set search_path='' as $$
declare r public.raw_items%rowtype; stale public.raw_items%rowtype;
begin
  -- Interrupted runs require an explicit controlled retry, never an automatic AI resend.
  for stale in select * from public.raw_items where status='processing' and claimed_until<now() for update skip locked loop
    update public.raw_items set status='failed',error_code='PROCESSING_INTERRUPTED',claim_token=null,claimed_until=null,updated_at=now() where id=stale.id;
    update public.extraction_cache set status='failed',error_code='PROCESSING_INTERRUPTED',updated_at=now() where user_id=stale.user_id and raw_item_id=stale.id and status<>'complete';
    insert into public.events(user_id,stage,level,message,metadata) values(stale.user_id,'understand','error','Analysis was interrupted',jsonb_build_object('raw_item_id',stale.id,'error_code','PROCESSING_INTERRUPTED'));
  end loop;
  select * into r from public.raw_items where status='queued' and next_attempt_at<=now() and (p_id is null or id=p_id) order by created_at limit 1 for update skip locked;
  if not found then return jsonb_build_object('claimed',false); end if;
  update public.raw_items set status='processing',claim_token=gen_random_uuid(),claimed_until=now()+interval '10 minutes',error_code=null,updated_at=now() where id=r.id returning * into r;
  return jsonb_build_object('claimed',true,'raw_item_id',r.id,'user_id',r.user_id,'claim_token',r.claim_token,'source_type',r.source_type,'raw_content',r.raw_content,'cleaned_text',r.cleaned_text,'final_url',r.final_url,'fetched_at',r.fetched_at);
end; $$;

create function public.finish_understand_item(p_id uuid,p_token uuid,p_result jsonb) returns jsonb language plpgsql set search_path='' as $$
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
      if existing - 'confidence' - 'evidence' - 'description' <> item - 'confidence' - 'evidence' - 'description' then
        update public.opportunities set ambiguity_flags=array(select distinct x from unnest(ambiguity_flags||array['source_variation']) x),updated_at=now() where user_id=r.user_id and id=v_opp;
      end if;
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

create function public.register_understand_content(p_id uuid,p_token uuid,p_hash text,p_text text,p_url text,p_fetched timestamptz) returns jsonb language plpgsql set search_path='' as $$
declare r public.raw_items%rowtype; cached public.extraction_cache%rowtype; result jsonb;
begin
  select * into r from public.raw_items where id=p_id and status='processing' and claim_token=p_token and claimed_until>now() for update;
  if not found then raise exception 'Stale claim'; end if;
  if p_hash!~'^[0-9a-f]{64}$' or p_text is null or length(p_text) not between 1 and 20000 then raise exception 'Invalid content'; end if;
  insert into public.extraction_cache(user_id,content_hash,version,raw_item_id,status) values(r.user_id,p_hash,'extract-v1',r.id,'prepared') on conflict do nothing;
  select * into strict cached from public.extraction_cache where user_id=r.user_id and content_hash=p_hash and version='extract-v1' for update;
  update public.raw_items set cleaned_text=p_text,final_url=p_url,fetched_at=p_fetched,content_hash=case when cached.raw_item_id=r.id then p_hash else null end,duplicate_of=case when cached.raw_item_id<>r.id then cached.raw_item_id else null end,updated_at=now() where id=r.id;
  if cached.status='complete' then
    result:=public.finish_understand_item(r.id,p_token,cached.result_json);
    return jsonb_build_object('route','cached','result',result);
  elsif cached.status='failed' then
    update public.raw_items set status='failed',error_code=cached.error_code,claim_token=null,claimed_until=null,updated_at=now() where id=r.id;
    insert into public.events(user_id,stage,level,message,metadata) values(r.user_id,'understand','error','Previous analysis needs a controlled retry',jsonb_build_object('raw_item_id',r.id,'error_code',cached.error_code));
    return jsonb_build_object('route','failed');
  elsif cached.raw_item_id<>r.id then
    update public.raw_items set status='queued',next_attempt_at=now()+interval '30 seconds',claim_token=null,claimed_until=null,updated_at=now() where id=r.id;
    return jsonb_build_object('route','waiting');
  end if;
  return jsonb_build_object('route','new');
end; $$;

create function public.reserve_extraction_budget(p_id uuid,p_token uuid) returns jsonb language plpgsql set search_path='' as $$
declare r public.raw_items%rowtype; b public.ai_extraction_budget%rowtype; v_day date:=(now() at time zone 'America/Los_Angeles')::date;
begin
  select * into r from public.raw_items where id=p_id and status='processing' and claim_token=p_token and claimed_until>now() for update;
  if not found then raise exception 'Stale claim'; end if;
  insert into public.ai_extraction_budget(day) values(v_day) on conflict do nothing;
  if not exists(select 1 from public.extraction_cache where user_id=r.user_id and raw_item_id=r.id and status='prepared') then return jsonb_build_object('allowed',false,'reason','already_reserved'); end if;
  perform pg_advisory_xact_lock(672002);
  select * into b from public.ai_extraction_budget where day=v_day for update;
  if exists(select 1 from public.ai_extraction_budget where running_until>now()) or b.last_reserved_at>now()-interval '60 seconds' then
    update public.raw_items set status='queued',next_attempt_at=now()+interval '60 seconds',claim_token=null,claimed_until=null,updated_at=now() where id=r.id;
    return jsonb_build_object('allowed',false,'reason','rate_wait');
  end if;
  if b.reserved_attempts+7>350 then return jsonb_build_object('allowed',false,'reason','QUOTA_LIMIT'); end if;
  update public.ai_extraction_budget set reserved_attempts=reserved_attempts+7,last_reserved_at=now(),running_raw_id=r.id,running_until=now()+interval '10 minutes' where day=v_day;
  update public.extraction_cache set status='extracting',updated_at=now() where user_id=r.user_id and raw_item_id=r.id and status='prepared';
  return jsonb_build_object('allowed',true);
end; $$;

create function public.fail_understand_item(p_id uuid,p_token uuid,p_error text) returns jsonb language plpgsql set search_path='' as $$
declare r public.raw_items%rowtype;
begin
  select * into r from public.raw_items where id=p_id and status='processing' and claim_token=p_token for update;
  if not found then return jsonb_build_object('failed',false,'reason','stale_claim'); end if;
  if p_error not in ('UNSAFE_URL','UNSAFE_ADDRESS','UNSAFE_REDIRECT','SOURCE_TIMEOUT','SOURCE_TOO_LARGE','SOURCE_TEXT_TOO_LARGE','SOURCE_REDIRECT_LIMIT','SOURCE_HTTP_ERROR','SOURCE_UNSUPPORTED','SOURCE_NO_READABLE_TEXT','SOURCE_ROBOTS_BLOCKED','INVALID_EXTRACTION','AI_UNAVAILABLE','QUOTA_LIMIT','PROCESSING_INTERRUPTED') then p_error:='AI_UNAVAILABLE'; end if;
  update public.raw_items set status='failed',error_code=p_error,claim_token=null,claimed_until=null,updated_at=now() where id=r.id;
  update public.extraction_cache set status='failed',error_code=p_error,updated_at=now() where user_id=r.user_id and raw_item_id=r.id and status<>'complete';
  update public.ai_extraction_budget set running_raw_id=null,running_until=null where running_raw_id=r.id;
  insert into public.events(user_id,stage,level,message,metadata) values(r.user_id,'understand',case when p_error='QUOTA_LIMIT' then 'warning' else 'error' end,'Opportunity analysis needs attention',jsonb_build_object('raw_item_id',r.id,'error_code',p_error));
  return jsonb_build_object('failed',true,'error_code',p_error);
end; $$;

create function public.retry_understand_item(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.raw_items%rowtype; v_user uuid:=auth.uid();
begin
  select * into r from public.raw_items where id=p_id and user_id=v_user and status='failed' for update;
  if not found then raise exception 'Failed submission not found'; end if;
  if r.retry_count>=2 then raise exception 'Retry limit reached; submit corrected content'; end if;
  -- Retry the canonical failed row only; duplicate rows can reuse its result afterwards.
  if r.duplicate_of is not null then raise exception 'Retry the original submission'; end if;
  update public.extraction_cache set status='prepared',error_code=null,updated_at=now() where user_id=v_user and raw_item_id=r.id and status='failed';
  update public.raw_items set status='queued',error_code=null,claim_token=null,claimed_until=null,retry_count=retry_count+1,next_attempt_at=now(),updated_at=now() where id=r.id;
  insert into public.events(user_id,stage,level,message,metadata) values(v_user,'understand','info','Analysis retry requested',jsonb_build_object('raw_item_id',r.id));
end; $$;
revoke all on function public.retry_understand_item(uuid) from public,anon;
grant execute on function public.retry_understand_item(uuid) to authenticated;
revoke all on function public.claim_understand_item(uuid),public.finish_understand_item(uuid,uuid,jsonb),public.register_understand_content(uuid,uuid,text,text,text,timestamptz),public.reserve_extraction_budget(uuid,uuid),public.fail_understand_item(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_understand_item(uuid),public.finish_understand_item(uuid,uuid,jsonb),public.register_understand_content(uuid,uuid,text,text,text,timestamptz),public.reserve_extraction_budget(uuid,uuid),public.fail_understand_item(uuid,uuid,text) to service_role;
alter publication supabase_realtime add table public.opportunities;
commit;
