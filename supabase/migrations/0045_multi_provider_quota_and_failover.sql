-- Migration 0045: Multi-provider quota & automatic model failover
-- Expands daily AI attempt allowance from single-model 350 up to multi-provider 10,000 attempts/day.
-- Ensures that if Gemini or Groq runs out of usage, the system seamlessly switches to the alternative model without early database abortion.

create or replace function public.reserve_extraction_budget(p_id uuid, p_token uuid) returns jsonb language plpgsql set search_path='' as $$
declare r public.raw_items%rowtype; b public.ai_extraction_budget%rowtype; v_day date:=(now() at time zone 'America/Los_Angeles')::date;
begin
  select * into r from public.raw_items where id=p_id and status='processing' and claim_token=p_token and claimed_until>now() for update;
  if not found then raise exception 'Stale claim'; end if;
  insert into public.ai_extraction_budget(day) values(v_day) on conflict do nothing;
  if not exists(select 1 from public.extraction_cache where user_id=r.user_id and raw_item_id=r.id and status='prepared') then return jsonb_build_object('allowed',false,'reason','already_reserved'); end if;
  perform pg_advisory_xact_lock(672002);
  select * into b from public.ai_extraction_budget where day=v_day for update;
  if exists(select 1 from public.ai_extraction_budget where running_until>now()) or b.last_reserved_at>now()-interval '2 seconds' then
    update public.raw_items set status='queued',next_attempt_at=now()+interval '2 seconds',claim_token=null,claimed_until=null,updated_at=now() where id=r.id;
    return jsonb_build_object('allowed',false,'reason','rate_wait');
  end if;
  -- Combined multi-provider daily quota allowance (Gemini free tier + Groq free tier = 10,000+ attempts/day)
  if b.reserved_attempts+7>10000 then return jsonb_build_object('allowed',false,'reason','QUOTA_LIMIT'); end if;
  update public.ai_extraction_budget set reserved_attempts=reserved_attempts+7,last_reserved_at=now(),running_raw_id=r.id,running_until=now()+interval '1 minute' where day=v_day;
  update public.extraction_cache set status='extracting',updated_at=now() where user_id=r.user_id and raw_item_id=r.id and status='prepared';
  return jsonb_build_object('allowed',true);
end; $$;

create or replace function public.reserve_match_budget(p_id uuid, p_token uuid, p_key text) returns jsonb language plpgsql set search_path='' as $$
declare m public.matches%rowtype; b public.ai_extraction_budget%rowtype; c public.match_cache%rowtype; v_day date:=(now() at time zone 'America/Los_Angeles')::date;
begin
 select * into m from public.matches where id=p_id and status='processing' and claim_token=p_token and claimed_until>now() for update;
 if not found then return jsonb_build_object('allowed',false,'reason','stale');end if;
 select * into c from public.match_cache where user_id=m.user_id and cache_key=p_key for update;
 if not found or c.status<>'prepared' then return jsonb_build_object('allowed',false,'reason','already_reserved');end if;
 perform pg_advisory_xact_lock(672002);
 insert into public.ai_extraction_budget(day) values(v_day) on conflict do nothing;
 select * into b from public.ai_extraction_budget where day=v_day for update;
 if exists(select 1 from public.ai_extraction_budget where running_until>now()) or b.last_reserved_at>now()-interval '2 seconds' then
  update public.matches set status='queued',claim_token=null,claimed_until=null,next_attempt_at=now()+interval '2 seconds',updated_at=now() where id=m.id;
  return jsonb_build_object('allowed',false,'reason','rate_wait');
 end if;
 -- Combined multi-provider daily quota allowance (Gemini free tier + Groq free tier = 10,000+ attempts/day)
 if b.reserved_attempts+7>10000 then return jsonb_build_object('allowed',false,'reason','QUOTA_LIMIT');end if;
 update public.ai_extraction_budget set reserved_attempts=reserved_attempts+7,last_reserved_at=now(),running_raw_id=null,running_match_token=p_token,running_until=now()+interval '1 minute' where day=v_day;
 update public.match_cache set status='running',claim_token=p_token,updated_at=now() where user_id=m.user_id and cache_key=p_key;
 return jsonb_build_object('allowed',true);
end; $$;

revoke all on function public.reserve_extraction_budget(uuid, uuid), public.reserve_match_budget(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_extraction_budget(uuid, uuid), public.reserve_match_budget(uuid, uuid, text) to service_role;
