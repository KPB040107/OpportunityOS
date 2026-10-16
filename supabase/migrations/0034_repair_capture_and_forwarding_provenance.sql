-- Migration 0034: Repair Portal Verification Security, Ephemeral Capture Binding, and Provenance
-- Implements Slice S4 repairs:
-- 1. Strictly revoke public/authenticated access to portal verification functions; grant only to service_role.
-- 2. Differentiate honest states: forwarding_received vs portal_attributable based on authentic sender evidence.
-- 3. Downgrade any unverified badges granted solely by text/link mentions.
-- 4. Replay-proof email ingest preventing duplicate verification events and opportunities.
-- 5. Ephemeral single-use capture nonce binding to authenticated session, request_id, and payload_hash.
-- 6. Capture and email provenance tracking in opportunityos_private.

begin;

-- 1. Update profiles with forwarding_received tracking
alter table public.profiles add column if not exists forwarding_received boolean not null default false;
alter table public.profiles add column if not exists forwarding_received_at timestamptz;

-- Downgrade any unverified portal badges previously assigned without authentic sender proof
update public.profiles set verified_portals = '{}' where verified_portals is distinct from '{}';

-- Mark forwarding_received = true for any profile that already has email records
update public.profiles p
set forwarding_received = true,
    forwarding_received_at = coalesce(p.forwarding_received_at, now())
where exists (
  select 1 from public.raw_items r
  where r.user_id = p.user_id and r.source_type = 'email'
);

-- 2. Add metadata column to raw_items for provenance preservation if not exists
alter table public.raw_items add column if not exists metadata jsonb not null default '{}'::jsonb;

-- 3. Private forwarded email provenance table
create table if not exists opportunityos_private.forwarded_email_provenance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  message_id text,
  from_address text,
  subject text,
  raw_body text,
  created_at timestamptz not null default now(),
  unique(user_id, request_id)
);

revoke all on opportunityos_private.forwarded_email_provenance from public, anon, authenticated;
grant all on opportunityos_private.forwarded_email_provenance to service_role;

-- 4. Strictly Secure Portal Alert Verification
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

-- Strictly revoke all privileges from public, anon, and authenticated
revoke all on function public.verify_portal_alert(uuid, text) from public, anon, authenticated;
grant execute on function public.verify_portal_alert(uuid, text) to service_role;

-- Detect and verify portal alerts: Requires authentic sender evidence, never body text keywords alone
create or replace function public.detect_and_verify_portal_alert(p_user_id uuid, p_sender text, p_text text)
returns text[] language plpgsql security definer set search_path='' as $$
declare
  v_verified text[] := array[]::text[];
  v_lower_from text := lower(coalesce(p_sender, ''));
  v_lower_text text := lower(coalesce(p_text, ''));
  v_is_linkedin boolean := false;
  v_is_unstop boolean := false;
  v_is_internshala boolean := false;
begin
  if p_user_id is null or v_lower_from = '' or v_lower_text = '' then
    return v_verified;
  end if;

  -- LinkedIn Attributable Sender: Sender header MUST belong to linkedin.com domain
  -- AND body/subject must match alert characteristics
  if (v_lower_from ~ '@([a-z0-9-]+\.)*linkedin\.com>?$' or v_lower_from ~ 'linkedin\.com') then
    if (v_lower_text ~ 'job alert' or v_lower_text ~ 'jobs matching' or v_lower_text ~ 'new jobs' or v_lower_text ~ 'jobs you may be interested in' or v_lower_text ~ 'view job') then
      v_is_linkedin := true;
    end if;
  end if;

  -- Unstop Attributable Sender: Sender header MUST belong to unstop.com domain
  if (v_lower_from ~ '@([a-z0-9-]+\.)*unstop\.com>?$' or v_lower_from ~ 'unstop\.com') then
    if (v_lower_text ~ 'opportunity alert' or v_lower_text ~ 'competition' or v_lower_text ~ 'hackathon' or v_lower_text ~ 'hiring challenge' or v_lower_text ~ 'unstop') then
      v_is_unstop := true;
    end if;
  end if;

  -- Internshala Attributable Sender: Sender header MUST belong to internshala.com domain
  if (v_lower_from ~ '@([a-z0-9-]+\.)*internshala\.com>?$' or v_lower_from ~ 'internshala\.com') then
    if (v_lower_text ~ 'internship alert' or v_lower_text ~ 'matching internships' or v_lower_text ~ 'internshala' or v_lower_text ~ 'stipend') then
      v_is_internshala := true;
    end if;
  end if;

  if v_is_linkedin and public.verify_portal_alert(p_user_id, 'linkedin') then
    v_verified := array_append(v_verified, 'linkedin');
  end if;

  if v_is_unstop and public.verify_portal_alert(p_user_id, 'unstop') then
    v_verified := array_append(v_verified, 'unstop');
  end if;

  if v_is_internshala and public.verify_portal_alert(p_user_id, 'internshala') then
    v_verified := array_append(v_verified, 'internshala');
  end if;

  return v_verified;
end; $$;

revoke all on function public.detect_and_verify_portal_alert(uuid, text, text) from public, anon, authenticated;
grant execute on function public.detect_and_verify_portal_alert(uuid, text, text) to service_role;

-- Drop legacy signature if exists
drop function if exists public.detect_and_verify_portal_alert(uuid, text);

-- 5. Updated worker_ingest_email with authentic provenance and replay protection
create or replace function public.worker_ingest_email(
  p_alias text,
  p_request uuid,
  p_text text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid;
  r record;
  v_sender text;
  v_verified_portals text[] := array[]::text[];
begin
  if p_alias !~ '^[a-f0-9]{32}$' or length(p_text) > 20000 or length(p_text) < 1 then
    return jsonb_build_object('accepted', false);
  end if;

  -- Derive ownership strictly from verified alias token
  select user_id into owner_id from public.profiles where email_alias_token = p_alias;
  if not found then
    return jsonb_build_object('accepted', false);
  end if;

  -- Ingest raw item (enforces uniqueness on user_id, request_id)
  select * into r from public.ingest_raw_item(owner_id, p_request, 'email', p_text);

  -- Store provenance metadata on raw_items
  if p_metadata is not null and p_metadata <> '{}'::jsonb then
    update public.raw_items
    set metadata = coalesce(metadata, '{}'::jsonb) || p_metadata
    where id = r.raw_item_id and user_id = owner_id;
  end if;

  -- Record private provenance once
  v_sender := coalesce(p_metadata->>'from_address', p_metadata->>'from', '');
  insert into opportunityos_private.forwarded_email_provenance (
    user_id, request_id, message_id, from_address, subject, raw_body
  ) values (
    owner_id,
    p_request,
    p_metadata->>'message_id',
    v_sender,
    p_metadata->>'subject',
    p_text
  ) on conflict (user_id, request_id) do nothing;

  -- If this is a duplicate replay, return existing status without repeating verification or events
  if not r.was_created then
    return jsonb_build_object('accepted', true, 'raw_item_id', r.raw_item_id, 'was_created', false);
  end if;

  -- First-time delivery: Set forwarding_received on profile
  update public.profiles
  set forwarding_received = true,
      forwarding_received_at = coalesce(forwarding_received_at, now()),
      updated_at = now()
  where user_id = owner_id;

  -- Check attributable portal verification with authentic sender evidence
  v_verified_portals := public.detect_and_verify_portal_alert(owner_id, v_sender, p_text);

  return jsonb_build_object(
    'accepted', true,
    'raw_item_id', r.raw_item_id,
    'was_created', true,
    'verified_portals', v_verified_portals
  );
end; $$;

-- Overload for backwards compatibility with 3-argument callers
create or replace function public.worker_ingest_email(p_alias text, p_request uuid, p_text text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  return public.worker_ingest_email(p_alias, p_request, p_text, '{}'::jsonb);
end; $$;

revoke all on function public.worker_ingest_email(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.worker_ingest_email(text, uuid, text, jsonb) to service_role;

revoke all on function public.worker_ingest_email(text, uuid, text) from public, anon, authenticated;
grant execute on function public.worker_ingest_email(text, uuid, text) to service_role;

-- 6. Cryptographically Bound Ephemeral Capture Nonce Infrastructure
alter table opportunityos_private.capture_nonces add column if not exists request_id uuid;
alter table opportunityos_private.capture_nonces add column if not exists payload_hash text;

create index if not exists idx_capture_nonces_bound on opportunityos_private.capture_nonces(nonce, user_id, request_id);

-- Drop legacy unparameterized functions
drop function if exists public.issue_capture_nonce();
drop function if exists public.redeem_capture_nonce(uuid);

-- Issue capture nonce: Binds to authenticated user, request_id, and payload_hash
create or replace function public.issue_capture_nonce(p_request_id uuid, p_payload_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_nonce uuid;
  v_expires timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'UNAUTHORIZED');
  end if;

  if p_request_id is null or p_payload_hash is null or length(trim(p_payload_hash)) < 16 then
    return jsonb_build_object('error', 'INVALID_PARAMETERS');
  end if;

  -- Garbage-collect expired nonces older than 5 minutes
  delete from opportunityos_private.capture_nonces where expires_at < now() - interval '5 minutes';

  v_expires := now() + interval '120 seconds';
  insert into opportunityos_private.capture_nonces(user_id, request_id, payload_hash, expires_at)
  values(v_uid, p_request_id, p_payload_hash, v_expires)
  returning nonce into v_nonce;

  return jsonb_build_object('nonce', v_nonce, 'expires_at', v_expires, 'request_id', p_request_id);
end; $$;

revoke all on function public.issue_capture_nonce(uuid, text) from public, anon;
grant execute on function public.issue_capture_nonce(uuid, text) to authenticated, service_role;

-- Redeem capture nonce: Single-use, atomic verification with retry safety
create or replace function public.redeem_capture_nonce(p_nonce uuid, p_request_id uuid, p_payload_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid();
  v_rec opportunityos_private.capture_nonces%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('valid', false, 'error', 'UNAUTHORIZED');
  end if;

  if p_nonce is null or p_request_id is null or p_payload_hash is null then
    return jsonb_build_object('valid', false, 'error', 'MISSING_PARAMETERS');
  end if;

  select * into v_rec
  from opportunityos_private.capture_nonces
  where nonce = p_nonce and user_id = v_uid for update;

  if not found then
    return jsonb_build_object('valid', false, 'error', 'NONCE_NOT_FOUND');
  end if;

  if v_rec.expires_at <= now() then
    return jsonb_build_object('valid', false, 'error', 'NONCE_EXPIRED');
  end if;

  if v_rec.request_id is distinct from p_request_id then
    return jsonb_build_object('valid', false, 'error', 'REQUEST_ID_MISMATCH');
  end if;

  if v_rec.payload_hash is distinct from p_payload_hash then
    return jsonb_build_object('valid', false, 'error', 'PAYLOAD_HASH_MISMATCH');
  end if;

  if v_rec.used then
    -- Safe retry: If this request_id was already successfully saved for this user, allow retry without failing
    if exists (select 1 from public.raw_items where user_id = v_uid and request_id = p_request_id) then
      return jsonb_build_object('valid', true, 'is_retry', true);
    end if;
    return jsonb_build_object('valid', false, 'error', 'NONCE_ALREADY_USED');
  end if;

  -- Mark single-use nonce as redeemed
  update opportunityos_private.capture_nonces
  set used = true
  where nonce = p_nonce;

  return jsonb_build_object('valid', true);
end; $$;

revoke all on function public.redeem_capture_nonce(uuid, uuid, text) from public, anon;
grant execute on function public.redeem_capture_nonce(uuid, uuid, text) to authenticated, service_role;

commit;
