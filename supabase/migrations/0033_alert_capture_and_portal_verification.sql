-- Migration 0033: Alert-Email Verification and Bookmarklet Capture Handshake
-- Implements Slice S4:
-- 1. Extend raw_items source_type to allow 'capture'
-- 2. Add verified_portals tracking to public.profiles
-- 3. Attributable portal alert detection and verification helper
-- 4. Ephemeral single-use capture nonce infrastructure in opportunityos_private

begin;

-- 1. Extend raw_items source_type to allow 'capture'
alter table public.raw_items drop constraint if exists raw_items_source_type_check;
alter table public.raw_items add constraint raw_items_source_type_check check(source_type in ('text','url','email','discovery','capture'));

-- 2. Ingest raw item update to allow 'capture'
create or replace function public.ingest_raw_item(p_user_id uuid, p_request_id uuid, p_source_type text, p_content text)
returns table(raw_item_id uuid, processing_status text, was_created boolean)
language plpgsql set search_path = '' as $$
declare
  v_id uuid;
  v_existing public.raw_items%rowtype;
begin
  if p_user_id is null or p_request_id is null then raise exception 'Identifiers required'; end if;
  if p_source_type not in ('text','url','email','discovery','capture') or p_source_type is null
    or p_content is null or length(trim(p_content)) not between 1 and 20000 then raise exception 'Invalid intake'; end if;
  insert into public.raw_items(user_id, request_id, source_type, raw_content)
    values(p_user_id, p_request_id, p_source_type, p_content)
    on conflict(user_id, request_id) do nothing returning id into v_id;
  if v_id is not null then
    insert into public.events(user_id, stage, level, message, metadata)
      values(p_user_id, 'ingest', 'info', 'Opportunity saved', jsonb_build_object('raw_item_id', v_id, 'source_type', p_source_type));
    return query select v_id, 'queued'::text, true;
  else
    select * into strict v_existing from public.raw_items where user_id = p_user_id and request_id = p_request_id;
    if v_existing.raw_content <> p_content or v_existing.source_type <> p_source_type then
      raise exception 'Request identifier already used for different content';
    end if;
    return query select v_existing.id, v_existing.status, false;
  end if;
end;
$$;

revoke all on function public.ingest_raw_item(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.ingest_raw_item(uuid, uuid, text, text) to service_role;

-- 3. Add verified_portals array to profiles
alter table public.profiles add column if not exists verified_portals text[] not null default '{}';

-- 4. Portal Alert Verification Functions
create or replace function public.verify_portal_alert(p_user_id uuid, p_portal text)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  v_lowered text := lower(trim(coalesce(p_portal, '')));
  v_already boolean;
begin
  if p_user_id is null then return false; end if;
  if v_lowered not in ('linkedin', 'unstop', 'internshala') then return false; end if;

  select v_lowered = any(verified_portals) into v_already
  from public.profiles where user_id = p_user_id;

  if v_already is not true then
    update public.profiles
    set verified_portals = array_append(verified_portals, v_lowered),
        updated_at = now()
    where user_id = p_user_id;

    insert into public.events(user_id, stage, level, message, metadata)
    values (
      p_user_id, 'intake', 'info',
      'Portal alert forwarding verified: ' || initcap(v_lowered),
      jsonb_build_object('portal', v_lowered, 'verified_at', now())
    );
    return true;
  end if;

  return false;
end; $$;

revoke all on function public.verify_portal_alert(uuid, text) from public, anon;
grant execute on function public.verify_portal_alert(uuid, text) to service_role, authenticated;

-- Detect and verify attributable portal alerts from email text
create or replace function public.detect_and_verify_portal_alert(p_user_id uuid, p_text text)
returns text[] language plpgsql security definer set search_path='' as $$
declare
  v_verified text[] := array[]::text[];
  v_lower text := lower(coalesce(p_text, ''));
begin
  if p_user_id is null or v_lower = '' then return v_verified; end if;

  -- LinkedIn Attributable Alert Marker: linkedin.com and job alert phrases
  if v_lower ~ 'linkedin\.com' and (v_lower ~ 'job alert' or v_lower ~ 'jobs matching' or v_lower ~ 'new jobs' or v_lower ~ 'jobs you may be interested in' or v_lower ~ 'view job') then
    if public.verify_portal_alert(p_user_id, 'linkedin') then
      v_verified := array_append(v_verified, 'linkedin');
    end if;
  end if;

  -- Unstop Attributable Alert Marker: unstop.com and competition/opportunity phrases
  if v_lower ~ 'unstop\.com' and (v_lower ~ 'opportunity alert' or v_lower ~ 'competition' or v_lower ~ 'hackathon' or v_lower ~ 'hiring challenge' or v_lower ~ 'unstop') then
    if public.verify_portal_alert(p_user_id, 'unstop') then
      v_verified := array_append(v_verified, 'unstop');
    end if;
  end if;

  -- Internshala Attributable Alert Marker: internshala.com and internship/job alert phrases
  if v_lower ~ 'internshala\.com' and (v_lower ~ 'internship alert' or v_lower ~ 'matching internships' or v_lower ~ 'internshala' or v_lower ~ 'stipend') then
    if public.verify_portal_alert(p_user_id, 'internshala') then
      v_verified := array_append(v_verified, 'internshala');
    end if;
  end if;

  return v_verified;
end; $$;

revoke all on function public.detect_and_verify_portal_alert(uuid, text) from public, anon;
grant execute on function public.detect_and_verify_portal_alert(uuid, text) to service_role;

-- 5. Update worker_ingest_email to trigger portal verification
create or replace function public.worker_ingest_email(p_alias text, p_request uuid, p_text text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid;
  r record;
begin
  if p_alias !~ '^[a-f0-9]{32}$' or length(p_text) > 20000 or length(p_text) < 1 then
    return jsonb_build_object('accepted', false);
  end if;

  select user_id into owner_id from public.profiles where email_alias_token = p_alias;
  if not found then
    return jsonb_build_object('accepted', false);
  end if;

  select * into r from public.ingest_raw_item(owner_id, p_request, 'email', p_text);
  update public.raw_items set source_type = 'email' where id = r.raw_item_id and user_id = owner_id;

  -- Check and mark attributable portal verification
  perform public.detect_and_verify_portal_alert(owner_id, p_text);

  return jsonb_build_object('accepted', true, 'raw_item_id', r.raw_item_id, 'was_created', r.was_created);
end; $$;

revoke all on function public.worker_ingest_email(text, uuid, text) from public, anon;
grant execute on function public.worker_ingest_email(text, uuid, text) to service_role;

-- 6. Ephemeral Capture Nonce Infrastructure in opportunityos_private
create table if not exists opportunityos_private.capture_nonces (
  nonce uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '60 seconds'),
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_capture_nonces_user on opportunityos_private.capture_nonces(user_id, expires_at);

-- Issue capture nonce RPC
create or replace function public.issue_capture_nonce()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_nonce uuid;
  v_expires timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;

  -- Garbage-collect expired nonces older than 5 minutes
  delete from opportunityos_private.capture_nonces where expires_at < now() - interval '5 minutes';

  v_expires := now() + interval '60 seconds';
  insert into opportunityos_private.capture_nonces(user_id, expires_at)
  values(v_uid, v_expires)
  returning nonce into v_nonce;

  return jsonb_build_object('nonce', v_nonce, 'expires_at', v_expires);
end; $$;

revoke all on function public.issue_capture_nonce() from public, anon;
grant execute on function public.issue_capture_nonce() to authenticated;

-- Redeem capture nonce RPC (single-use, strictly enforces ownership, expiration, and replay prevention)
create or replace function public.redeem_capture_nonce(p_nonce uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_rec opportunityos_private.capture_nonces%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('valid', false, 'error', 'UNAUTHORIZED');
  end if;

  if p_nonce is null then
    return jsonb_build_object('valid', false, 'error', 'MISSING_NONCE');
  end if;

  select * into v_rec
  from opportunityos_private.capture_nonces
  where nonce = p_nonce and user_id = v_uid for update;

  if not found then
    return jsonb_build_object('valid', false, 'error', 'NONCE_NOT_FOUND');
  end if;

  if v_rec.used then
    return jsonb_build_object('valid', false, 'error', 'NONCE_ALREADY_USED');
  end if;

  if v_rec.expires_at <= now() then
    return jsonb_build_object('valid', false, 'error', 'NONCE_EXPIRED');
  end if;

  -- Mark single-use nonce as redeemed
  update opportunityos_private.capture_nonces
  set used = true
  where nonce = p_nonce;

  return jsonb_build_object('valid', true);
end; $$;

revoke all on function public.redeem_capture_nonce(uuid) from public, anon;
grant execute on function public.redeem_capture_nonce(uuid) to authenticated;

commit;
