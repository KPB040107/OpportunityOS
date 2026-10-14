-- Migration 0024: Autonomous Discovery Registry, Public Catalog & Trust Tiers
-- Implements Decision D2 (Tiered Trust: Corroborated, Attributed, Unverified)
-- and Decision D4 (Shared worker-private public catalog, projected into owned inboxes)
begin;

-- 1. Extend raw_items source_type to allow 'discovery'
alter table public.raw_items drop constraint if exists raw_items_source_type_check;
alter table public.raw_items add constraint raw_items_source_type_check check(source_type in ('text','url','email','discovery'));

-- 2. Add trust tiers and catalog fields to opportunities
alter table public.opportunities add column if not exists trust_tier text default 'attributed' check (trust_tier in ('corroborated', 'attributed', 'unverified'));
alter table public.opportunities add column if not exists source_badge text;
alter table public.opportunities add column if not exists catalog_id uuid;
alter table public.opportunities add column if not exists risk_signals text[] default '{}';

-- 3. Source Registry (worker-private)
create table if not exists opportunityos_private.source_registry (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 adapter text not null,
 source_kind text not null,
 config jsonb not null default '{}'::jsonb,
 allowed_hosts text[] not null default '{}',
 cadence text not null default 'daily',
 status text not null default 'active' check (status in ('active', 'paused', 'failed', 'unsupported', 'awaiting_validation')),
 last_successful_scan timestamptz,
 next_attempt timestamptz not null default now(),
 item_count int not null default 0,
 error_count int not null default 0,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

-- Seed verified sources into source_registry
insert into opportunityos_private.source_registry (name, adapter, source_kind, config, allowed_hosts, status)
values
 ('CRED Careers', 'lever-v1', 'company_feed', '{"company": "cred"}'::jsonb, ARRAY['api.lever.co'], 'active'),
 ('Meesho Careers', 'lever-v1', 'company_feed', '{"company": "meesho"}'::jsonb, ARRAY['api.lever.co'], 'active'),
 ('Devpost Hackathons', 'devpost-v1', 'hackathon_registry', '{"url": "https://devpost.com/api/hackathons"}'::jsonb, ARRAY['devpost.com'], 'active'),
 ('JSearch India Internships', 'jsearch-v1', 'search_api', '{"queries": ["software engineering intern Bengaluru", "SDE intern India"]}'::jsonb, ARRAY['jsearch.p.rapidapi.com', 'api.openwebninja.com'], 'awaiting_validation')
on conflict do nothing;

-- 4. Worker-Private Public Catalog
create table if not exists opportunityos_private.catalog_opportunities (
 id uuid primary key default gen_random_uuid(),
 stable_key text not null unique,
 source_id uuid references opportunityos_private.source_registry(id) on delete set null,
 adapter text not null,
 external_id text not null,
 title text not null,
 organization text,
 type text not null check(type in ('job', 'internship', 'hackathon')),
 location text,
 deadline date,
 application_url text,
 original_url text not null,
 trust_tier text not null default 'attributed' check (trust_tier in ('corroborated', 'attributed', 'unverified')),
 risk_signals text[] not null default '{}',
 content_hash text not null,
 raw_text text not null,
 structured_fields jsonb not null default '{}'::jsonb,
 field_provenance jsonb not null default '[]'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

-- 5. Discovery Runs Table
create table if not exists opportunityos_private.discovery_runs (
 id uuid primary key default gen_random_uuid(),
 source_id uuid references opportunityos_private.source_registry(id) on delete cascade,
 adapter text not null,
 status text not null default 'running' check (status in ('running', 'ok', 'error', 'quota_limited')),
 items_found int not null default 0,
 items_new int not null default 0,
 items_updated int not null default 0,
 error_message text,
 created_at timestamptz not null default now(),
 completed_at timestamptz
);

-- 6. Worker Function: Claim Due Source for Scanning
create or replace function public.worker_claim_due_discovery() returns jsonb language plpgsql security definer set search_path='' as $$
declare s opportunityos_private.source_registry%rowtype;run_id uuid;
begin
 select * into s from opportunityos_private.source_registry
  where status='active' and next_attempt<=now()
  order by next_attempt, id limit 1 for update skip locked;
 if not found then return jsonb_build_object('claimed', false); end if;

 insert into opportunityos_private.discovery_runs(source_id, adapter, status)
 values(s.id, s.adapter, 'running') returning id into run_id;

 -- Defer next attempt by 6 hours to prevent concurrent double-scans
 update opportunityos_private.source_registry set next_attempt=now()+interval '6 hours', updated_at=now() where id=s.id;

 return jsonb_build_object('claimed', true, 'run_id', run_id, 'source_id', s.id, 'name', s.name, 'adapter', s.adapter, 'source_kind', s.source_kind, 'config', s.config);
end; $$;

-- 7. Worker Function: Ingest Catalog Item & Project to Active Users
create or replace function public.worker_save_discovery_item(p_run_id uuid, p_item jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 cat_id uuid;
 was_created boolean:=false;
 u record;
 r_id uuid;
 opp_id uuid;
 fp text;
 tier text;
 badge text;
 risk text[];
begin
 if p_item->>'title' is null or p_item->>'original_url' is null or p_item->>'external_id' is null then
   return jsonb_build_object('saved', false, 'error', 'Missing required item fields');
 end if;

 -- Scope guard: 3 opportunity types only (job, internship, hackathon)
 if p_item->>'type' not in ('job', 'internship', 'hackathon') then
   return jsonb_build_object('saved', false, 'ignored_reason', 'out_of_scope_type');
 end if;

 tier := coalesce(p_item->>'trust_tier', 'attributed');
 badge := coalesce(p_item->>'source_badge', p_item->>'adapter');
 risk := array(select jsonb_array_elements_text(coalesce(p_item->'risk_signals', '[]'::jsonb)));

 if array_length(risk, 1) > 0 then
   tier := 'unverified';
 end if;

 -- Upsert into worker-private catalog
 insert into opportunityos_private.catalog_opportunities(
   stable_key, adapter, external_id, title, organization, type, location, deadline,
   application_url, original_url, trust_tier, risk_signals, content_hash, raw_text,
   structured_fields, field_provenance
 ) values (
   concat(p_item->>'adapter', ':', p_item->>'external_id'),
   p_item->>'adapter',
   p_item->>'external_id',
   p_item->>'title',
   p_item->>'organization',
   p_item->>'type',
   p_item->>'location',
   case when p_item->>'deadline' is not null and p_item->>'deadline' ~ '^\d{4}-\d{2}-\d{2}$' then (p_item->>'deadline')::date else null end,
   p_item->>'application_url',
   p_item->>'original_url',
   tier,
   risk,
   coalesce(p_item->>'content_hash', encode(extensions.digest(concat(p_item->>'title', p_item->>'raw_text')::bytea, 'sha256'), 'hex')),
   coalesce(p_item->>'raw_text', p_item->>'title'),
   coalesce(p_item->'fields', '{}'::jsonb),
   coalesce(p_item->'field_provenance', '[]'::jsonb)
 ) on conflict (stable_key) do update set
   title = excluded.title,
   organization = excluded.organization,
   type = excluded.type,
   location = excluded.location,
   deadline = excluded.deadline,
   application_url = excluded.application_url,
   trust_tier = excluded.trust_tier,
   risk_signals = excluded.risk_signals,
   raw_text = excluded.raw_text,
   updated_at = now()
 returning id into cat_id;

 -- Project to every active user profile
 for u in select user_id from public.profiles loop
   fp := encode(extensions.digest(concat(u.user_id::text, ':', p_item->>'adapter', ':', p_item->>'external_id')::bytea, 'sha256'), 'hex');

   -- Insert raw item projection
   insert into public.raw_items(user_id, request_id, source_type, raw_content, status, is_opportunity, content_hash)
   values (
     u.user_id, gen_random_uuid(), 'discovery',
     concat('DISCOVERED: ', p_item->>'title', ' from ', badge, E'\n', coalesce(p_item->>'raw_text', '')),
     'understood', true,
     encode(extensions.digest(concat(u.user_id::text, ':', p_item->>'title')::bytea, 'sha256'), 'hex')
   ) on conflict (user_id, content_hash) where content_hash is not null
   do update set updated_at=now() returning id into r_id;

   -- Insert opportunity projection
   insert into public.opportunities(
     user_id, fingerprint, title, organization, deadline, location, type,
     application_url, description, skills, ambiguity_flags, extracted_json,
     extraction_confidence, extraction_version, trust_tier, source_badge, catalog_id, risk_signals
   ) values (
     u.user_id, fp, p_item->>'title', p_item->>'organization',
     case when p_item->>'deadline' is not null and p_item->>'deadline' ~ '^\d{4}-\d{2}-\d{2}$' then (p_item->>'deadline')::date else null end,
     p_item->>'location', p_item->>'type', p_item->>'application_url',
     p_item->>'raw_text',
     array(select jsonb_array_elements_text(coalesce(p_item->'skills', '[]'::jsonb))),
     risk,
     p_item,
     1.0, 'discovery-v1', tier, badge, cat_id, risk
   ) on conflict (user_id, fingerprint) do update set
     deadline = excluded.deadline,
     trust_tier = excluded.trust_tier,
     risk_signals = excluded.risk_signals,
     updated_at = now()
   returning id into opp_id;

   -- Link in opportunity_sources
   if opp_id is not null and r_id is not null then
     insert into public.opportunity_sources(user_id, opportunity_id, raw_item_id, extracted_json)
     values (u.user_id, opp_id, r_id, p_item)
     on conflict do nothing;

     -- Queue evaluation so match score & decision are generated!
     perform public.enqueue_evaluation(u.user_id, opp_id);
     was_created := true;
   end if;
 end loop;

 return jsonb_build_object('saved', true, 'catalog_id', cat_id, 'was_created', was_created);
end; $$;

-- 8. Worker Function: Complete Discovery Run
create or replace function public.worker_finish_discovery_run(p_run_id uuid, p_status text, p_found int, p_new int, p_updated int, p_error text default null) returns boolean language plpgsql security definer set search_path='' as $$
declare r opportunityos_private.discovery_runs%rowtype;
begin
 update opportunityos_private.discovery_runs
  set status=p_status, items_found=p_found, items_new=p_new, items_updated=p_updated,
      error_message=p_error, completed_at=now()
  where id=p_run_id returning * into r;

 if r.source_id is not null then
   update opportunityos_private.source_registry
    set last_successful_scan = case when p_status = 'ok' then now() else last_successful_scan end,
        last_error = p_error,
        item_count = item_count + p_new,
        error_count = case when p_status = 'error' then error_count + 1 else error_count end,
        next_attempt = now() + interval '24 hours',
        updated_at = now()
    where id=r.source_id;
 end if;
 return true;
end; $$;

-- 9. RPC for web interface: View Source Registry Status
create or replace function public.get_discovery_sources() returns table(
 id uuid, name text, adapter text, source_kind text, status text,
 last_scan timestamptz, item_count int
) language sql security definer set search_path='' as $$
 select id, name, adapter, source_kind, status, last_successful_scan, item_count
 from opportunityos_private.source_registry
 order by created_at;
$$;

revoke all on function public.get_discovery_sources() from public, anon;
grant execute on function public.get_discovery_sources() to authenticated;

commit;
