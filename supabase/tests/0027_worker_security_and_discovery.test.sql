-- Rehearsal 1: Discovery from permitted source with grounded facts and rescan deduplication
begin;

select set_config('opportunityos.test_user', gen_random_uuid()::text, true);

insert into auth.users(id, email)
values(current_setting('opportunityos.test_user')::uuid, 'rehearsal1-' || current_setting('opportunityos.test_user') || '@example.invalid');

insert into public.profiles(user_id, display_name, interest_types)
values(current_setting('opportunityos.test_user')::uuid, 'Rehearsal 1 Student', array['internship', 'job']);

do $$
declare
  s record;
  run_res jsonb;
  v_run_id uuid;
  v_lease uuid;
  v_item jsonb;
  save_res jsonb;
  rescan_res jsonb;
  cat_item record;
  opp record;
begin
  -- 1. Verify active source registry
  select * into s from opportunityos_private.source_registry where name = 'CRED Careers';
  if not found then raise exception 'CRED Careers source missing from registry'; end if;
  if s.trust_tier <> 'corroborated' then raise exception 'CRED Careers must have corroborated trust tier'; end if;

  -- 2. Claim due discovery
  run_res := public.worker_claim_due_discovery();
  if not (run_res->>'claimed')::boolean then
    -- Manually create running discovery run for test if not currently due
    v_lease := gen_random_uuid();
    insert into opportunityos_private.discovery_runs(source_id, adapter, status, lease_token, claimed_until)
    values(s.id, s.adapter, 'running', v_lease, now() + interval '5 minutes')
    returning id into v_run_id;
  else
    v_run_id := (run_res->>'run_id')::uuid;
    v_lease := (run_res->>'lease_token')::uuid;
  end if;

  -- 3. Prepare grounded item payload
  v_item := jsonb_build_object(
    'contract_version', 'source-item-v2',
    'visibility', 'public',
    'source_kind', 'company_feed',
    'adapter', 'lever-v1',
    'external_id', 'cred-be-intern-rehearsal',
    'title', 'Backend Platform Engineer - Intern',
    'organization', 'CRED',
    'type', 'internship',
    'location', 'Bengaluru, India',
    'deadline', null,
    'original_url', 'https://jobs.lever.co/cred/cred-be-intern-rehearsal',
    'application_url', 'https://jobs.lever.co/cred/cred-be-intern-rehearsal/apply',
    'trust_tier', 'corroborated',
    'source_badge', 'CRED Careers',
    'risk_signals', '[]'::jsonb,
    'raw_text', 'Backend Platform Engineer - Intern\nOrganization: CRED\nLocation: Bengaluru, India\nTeam: Core Infrastructure\nRequirements: B.Tech in Computer Science or IT\nApply: https://jobs.lever.co/cred/cred-be-intern-rehearsal/apply',
    'content_hash', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );

  -- 4. Save discovery item
  save_res := public.worker_save_discovery_item(v_run_id, v_item, v_lease);
  if not (save_res->>'saved')::boolean then
    raise exception 'Failed to save discovery item: %', save_res;
  end if;

  -- 5. Verify catalog item saved with corroborated trust tier
  select * into cat_item from opportunityos_private.catalog_opportunities where id = (save_res->>'catalog_id')::uuid;
  if cat_item.trust_tier <> 'corroborated' then
    raise exception 'Catalog trust tier is not corroborated: %', cat_item.trust_tier;
  end if;
  if cat_item.type <> 'internship' then
    raise exception 'Catalog type is not internship: %', cat_item.type;
  end if;

  -- 6. Verify projection to test user's inbox
  select * into opp from public.opportunities where user_id = current_setting('opportunityos.test_user')::uuid and catalog_id = cat_item.id;
  if not found then
    raise exception 'Opportunity was not projected to matching student profile';
  end if;

  -- 7. Rescan deduplication: saving identical item again does not duplicate
  rescan_res := public.worker_save_discovery_item(v_run_id, v_item, v_lease);
  if not (rescan_res->>'saved')::boolean or (rescan_res->>'was_created')::boolean or not (rescan_res->>'rescan_unchanged')::boolean then
    raise exception 'Rescan was not recognized as unchanged deduplicated rescan: %', rescan_res;
  end if;

end;$$;

rollback;
select 'PASS: Rehearsal 1 - Discovery from permitted source with grounded facts and rescan deduplication' as test_result;
