-- Expired AI cache leases require a visible controlled retry, not an endless wait.
begin;
alter table public.match_cache add column running_until timestamptz;
create or replace function public.register_match_cache(p_id uuid,p_token uuid,p_key text) returns jsonb language plpgsql set search_path='' as $$
declare m public.matches%rowtype; c public.match_cache%rowtype;
begin
 select * into m from public.matches where id=p_id and status='processing' and claim_token=p_token and claimed_until>now() for update;
 if not found then return jsonb_build_object('route','stale');end if;
 if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'Invalid match cache key';end if;
 update public.matches set cache_key=p_key where id=m.id;
 insert into public.match_cache(user_id,cache_key) values(m.user_id,p_key) on conflict do nothing;
 select * into c from public.match_cache where user_id=m.user_id and cache_key=p_key for update;
 if c.status='complete' then return jsonb_build_object('route','cached','result',c.result_json);end if;
 if c.status='running' and coalesce(c.running_until,c.updated_at+interval '10 minutes')<=now() then
  update public.match_cache set status='failed',error_code='EVALUATION_INTERRUPTED',updated_at=now() where user_id=m.user_id and cache_key=p_key;
  return jsonb_build_object('route','failed','error_code','EVALUATION_INTERRUPTED');
 end if;
 if c.status='failed' then return jsonb_build_object('route','failed','error_code',c.error_code);end if;
 if c.status='running' then
  update public.matches set status='queued',claim_token=null,claimed_until=null,next_attempt_at=now()+interval '60 seconds',updated_at=now() where id=m.id;
  return jsonb_build_object('route','waiting');
 end if;
 return jsonb_build_object('route','new');
end; $$;
create or replace function public.queue_opportunity_evaluation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' or public.opportunity_material(new.extracted_json)<>public.opportunity_material(old.extracted_json) or
   row(new.title,new.organization,new.deadline,new.location,new.type,new.application_url,new.description,new.skills,new.extraction_confidence) is distinct from row(old.title,old.organization,old.deadline,old.location,old.type,old.application_url,old.description,old.skills,old.extraction_confidence) or
   (select coalesce(array_agg(f order by f),'{}') from unnest(new.ambiguity_flags) f where f<>'source_contains_instructions') is distinct from (select coalesce(array_agg(f order by f),'{}') from unnest(old.ambiguity_flags) f where f<>'source_contains_instructions') then
  perform public.enqueue_evaluation(new.user_id,new.id);
 end if;return new;
end; $$;
create or replace function public.queue_requirement_evaluation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then
  if exists(select 1 from public.opportunities where user_id=old.user_id and id=old.opportunity_id) then perform public.enqueue_evaluation(old.user_id,old.opportunity_id);end if;
  return old;
 end if;
 perform public.enqueue_evaluation(new.user_id,new.opportunity_id);return new;
end; $$;
drop trigger queue_requirement on public.opportunity_requirements;
create trigger queue_requirement after insert or update or delete on public.opportunity_requirements for each row execute function public.queue_requirement_evaluation();
commit;
