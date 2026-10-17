-- 0067_atomic_catalog_requirement_refresh.sql
-- Implements atomic refresh of opportunity requirements when discovered listings update or catch up.
-- Preserves student save/hide/applied status, action history, and prevents duplicate cards.
-- Fences evaluations by incrementing match revision on refresh.

begin;

create or replace function public.worker_save_discovery_item(
  p_run_id uuid,
  p_item jsonb,
  p_lease_token uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_run record;
  v_cat_id uuid;
  v_existing_id uuid;
  v_existing_hash text;
  v_was_created boolean := false;
  u record;
  v_raw_id uuid;
  v_opp_id uuid;
  v_fp text;
  v_content_hash text;
  v_trust_tier text;
  v_source_badge text;
  v_risk_signals text[];
  v_deadline date;
  v_type text;
  v_seniority text;
  v_user_pref text;
  v_is_intern_seeker boolean;
  v_title text;
  req jsonb;
  v_projection_hash text;
  v_req_status text;
  v_req_class text;
  v_quote text;
  v_kind text;
  v_reqs jsonb;
  v_skills jsonb;
  v_structured jsonb;
begin
  -- Validate Claimed Run Lease
  select r.*, s.trust_tier as reg_trust_tier, coalesce(s.source_badge, s.name) as reg_source_badge
  into v_run
  from opportunityos_private.discovery_runs r
  join opportunityos_private.source_registry s on s.id = r.source_id
  where r.id = p_run_id and r.status = 'running' and r.claimed_until > now()
  for update;

  if not found then
    return jsonb_build_object('saved', false, 'error', 'INVALID_OR_EXPIRED_DISCOVERY_RUN');
  end if;

  if p_lease_token is null or v_run.lease_token is distinct from p_lease_token then
    return jsonb_build_object('saved', false, 'error', 'LEASE_TOKEN_MISMATCH');
  end if;

  if p_item->>'title' is null or p_item->>'original_url' is null or p_item->>'external_id' is null then
    return jsonb_build_object('saved', false, 'error', 'Missing required item fields');
  end if;

  v_title := p_item->>'title';
  v_type := p_item->>'type';
  -- Scope guard: strictly job, internship, or hackathon
  if v_type not in ('job', 'internship', 'hackathon') then
    return jsonb_build_object('saved', false, 'ignored_reason', 'out_of_scope_type');
  end if;

  -- Classify seniority
  v_seniority := public.classify_seniority(v_title, coalesce(p_item->'fields'->>'commitment', ''));

  -- Trust tier derived STRICTLY from registry, never from caller payload
  v_trust_tier := v_run.reg_trust_tier;
  v_source_badge := v_run.reg_source_badge;
  v_risk_signals := array(select jsonb_array_elements_text(coalesce(p_item->'risk_signals', '[]'::jsonb)));

  if array_length(v_risk_signals, 1) > 0 then
    v_trust_tier := 'unverified';
  end if;

  -- Parse deadline safely
  v_deadline := case 
    when p_item->>'deadline' is not null and p_item->>'deadline' ~ '^\d{4}-\d{2}-\d{2}$' 
    then (p_item->>'deadline')::date 
    else null 
  end;

  v_content_hash := coalesce(
    p_item->>'content_hash', 
    encode(extensions.digest(concat(v_title, ':', coalesce(p_item->>'location', ''), ':', coalesce(p_item->>'raw_text', ''))::bytea, 'sha256'), 'hex')
  );

  v_reqs := coalesce(p_item->'requirements', p_item->'fields'->'requirements', '[]'::jsonb);
  v_skills := coalesce(p_item->'skills', p_item->'fields'->'skills', '[]'::jsonb);

  v_req_status := coalesce(
    p_item->>'requirements_status',
    p_item->'fields'->>'requirements_status',
    case
      when jsonb_array_length(v_reqs) > 0 or jsonb_array_length(v_skills) > 0 then 'REQUIREMENTS_PRESENT'
      when length(coalesce(p_item->>'raw_text', '')) > 200 then 'EXTRACTION_INCOMPLETE'
      else 'NO_REQUIREMENTS_STATED'
    end
  );

  v_structured := jsonb_build_object(
    'title', v_title,
    'location', p_item->>'location',
    'organization', p_item->>'organization',
    'deadline', v_deadline,
    'requirements', v_reqs,
    'skills', v_skills,
    'requirements_status', v_req_status
  ) || coalesce(p_item->'fields', '{}'::jsonb);

  -- Check existing catalog entry for deduplicating rescans
  select id, content_hash into v_existing_id, v_existing_hash
  from opportunityos_private.catalog_opportunities
  where stable_key = concat(v_run.adapter, ':', p_item->>'external_id');

  -- Canonical stable key includes adapter and external id
  insert into opportunityos_private.catalog_opportunities(
    stable_key, source_id, adapter, external_id, title, organization, type, location, deadline,
    application_url, original_url, trust_tier, risk_signals, content_hash, raw_text,
    structured_fields, field_provenance, seniority_level, requirements_status
  ) values (
    concat(v_run.adapter, ':', p_item->>'external_id'),
    v_run.source_id,
    v_run.adapter,
    p_item->>'external_id',
    v_title,
    p_item->>'organization',
    v_type,
    p_item->>'location',
    v_deadline,
    p_item->>'application_url',
    p_item->>'original_url',
    v_trust_tier,
    v_risk_signals,
    v_content_hash,
    coalesce(p_item->>'raw_text', v_title),
    v_structured,
    coalesce(p_item->'field_provenance', '[]'::jsonb),
    v_seniority,
    v_req_status
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
    content_hash = excluded.content_hash,
    structured_fields = excluded.structured_fields,
    seniority_level = excluded.seniority_level,
    requirements_status = excluded.requirements_status,
    updated_at = now()
  returning id into v_cat_id;

  -- Project to users with relevance, field matching, and mute filtering
  for u in 
    select p.user_id, p.interest_types, p.career_goals, p.branch, (select coalesce(array_agg(s.canonical_name),'{}'::text[]) from public.profile_skills ps join public.skills s on s.id=ps.skill_id where ps.user_id=p.user_id) as skills
    from public.profiles p
    where p.interest_types is null 
       or cardinality(p.interest_types) = 0 
       or v_type = any(p.interest_types)
  loop
    -- Check user source preference (e.g. muted sources)
    select preference into v_user_pref
    from public.user_source_preferences
    where user_id = u.user_id and source_identifier = lower(coalesce(p_item->>'organization', ''));

    if v_user_pref = 'muted' then
      continue; -- Skip projection for muted sources
    end if;

    -- The India demo accepts India and remote listings; reject explicit foreign-only locations.
    if v_type<>'hackathon' and coalesce(p_item->>'location','') ~* '(london|san francisco|seattle|austin|dublin|ireland|germany|berlin|france|paris|united kingdom|united states|usa|canada|toronto|vancouver|australia|sydney|singapore|tokyo|japan)'
       and coalesce(p_item->>'location','') !~* '(india|bengaluru|bangalore|hyderabad|pune|mumbai|delhi|noida|gurugram|chennai|kolkata|remote|worldwide)' then continue; end if;
    if not public.profile_domain_matches(v_title,v_type,array(select jsonb_array_elements_text(v_skills)),u.branch,u.skills) then continue; end if;

    -- Seniority relevance check for student profiles
    v_is_intern_seeker := (u.interest_types is null or cardinality(u.interest_types) = 0 or 'internship' = any(u.interest_types));
    if v_is_intern_seeker and v_seniority in ('senior', 'executive') then
      if not (coalesce(u.career_goals, '') ~* 'senior|lead|manager|director') then
        continue;
      end if;
    end if;

    -- Check if user already owns this opportunity via catalog_id
    select id, extracted_json->>'content_hash' into v_opp_id, v_projection_hash
    from public.opportunities where user_id=u.user_id and catalog_id=v_cat_id
    order by created_at, id limit 1;

    if found then
      -- Refresh if content changed OR if requirements are missing while present in update
      if v_projection_hash is distinct from v_content_hash 
         or not exists (select 1 from public.opportunity_requirements r where r.opportunity_id = v_opp_id and r.user_id = u.user_id)
         or jsonb_array_length(v_reqs) > 0
      then
        update public.opportunities set
          title = v_title,
          organization = p_item->>'organization',
          deadline = v_deadline,
          location = p_item->>'location',
          application_url = p_item->>'application_url',
          description = coalesce(p_item->>'raw_text', v_title),
          skills = array(select jsonb_array_elements_text(v_skills)),
          extracted_json = p_item,
          trust_tier = v_trust_tier,
          source_badge = v_source_badge,
          risk_signals = v_risk_signals,
          seniority_level = v_seniority,
          requirements_status = v_req_status,
          updated_at = now()
        where id = v_opp_id and user_id = u.user_id;

        -- Atomically replace requirements with quote-verified requirements
        delete from public.opportunity_requirements where opportunity_id = v_opp_id and user_id = u.user_id;
        for req in select value from jsonb_array_elements(v_reqs) loop
          v_quote := coalesce(req->>'quote', req->>'evidence', '');
          if length(v_quote) > 0 and position(lower(v_quote) in lower(coalesce(p_item->>'raw_text', ''))) > 0 then
            v_kind := case
              when req->>'kind' in ('cgpa', 'academic_year', 'graduation_year', 'branch', 'degree', 'location', 'skill', 'other')
              then req->>'kind'
              else 'other'
            end;
            v_req_class := coalesce(req->>'requirement_class', case when coalesce((req->>'mandatory')::boolean, false) then 'mandatory_eligibility' else 'preferred_skill' end);
            insert into public.opportunity_requirements(
              user_id, opportunity_id, kind, value, mandatory, evidence_snippet, requirement_class, quote, status
            ) values (
              u.user_id, v_opp_id, v_kind, coalesce(req->>'value', v_quote),
              coalesce((req->>'mandatory')::boolean, false),
              v_quote, v_req_class, v_quote, 'active'
            );
          end if;
        end loop;

        perform public.enqueue_evaluation(u.user_id, v_opp_id);
      end if;
      continue;
    end if;

    -- Composite fingerprint includes user, adapter, external_id, and location
    v_fp := encode(extensions.digest(concat(u.user_id::text, ':', v_run.adapter, ':', p_item->>'external_id', ':', coalesce(p_item->>'location', ''))::bytea, 'sha256'), 'hex');

    select id, extracted_json->>'content_hash' into v_opp_id, v_projection_hash
    from public.opportunities where user_id=u.user_id and fingerprint=v_fp;

    if found then
      if v_projection_hash is distinct from v_content_hash
         or not exists (select 1 from public.opportunity_requirements r where r.opportunity_id = v_opp_id and r.user_id = u.user_id)
         or jsonb_array_length(v_reqs) > 0
      then
        update public.opportunities set
          title = v_title,
          organization = p_item->>'organization',
          deadline = v_deadline,
          location = p_item->>'location',
          application_url = p_item->>'application_url',
          description = coalesce(p_item->>'raw_text', v_title),
          skills = array(select jsonb_array_elements_text(v_skills)),
          extracted_json = p_item,
          trust_tier = v_trust_tier,
          source_badge = v_source_badge,
          risk_signals = v_risk_signals,
          seniority_level = v_seniority,
          requirements_status = v_req_status,
          catalog_id = v_cat_id,
          updated_at = now()
        where id = v_opp_id and user_id = u.user_id;

        delete from public.opportunity_requirements where opportunity_id = v_opp_id and user_id = u.user_id;
        for req in select value from jsonb_array_elements(v_reqs) loop
          v_quote := coalesce(req->>'quote', req->>'evidence', '');
          if length(v_quote) > 0 and position(lower(v_quote) in lower(coalesce(p_item->>'raw_text', ''))) > 0 then
            v_kind := case
              when req->>'kind' in ('cgpa', 'academic_year', 'graduation_year', 'branch', 'degree', 'location', 'skill', 'other')
              then req->>'kind'
              else 'other'
            end;
            v_req_class := coalesce(req->>'requirement_class', case when coalesce((req->>'mandatory')::boolean, false) then 'mandatory_eligibility' else 'preferred_skill' end);
            insert into public.opportunity_requirements(
              user_id, opportunity_id, kind, value, mandatory, evidence_snippet, requirement_class, quote, status
            ) values (
              u.user_id, v_opp_id, v_kind, coalesce(req->>'value', v_quote),
              coalesce((req->>'mandatory')::boolean, false),
              v_quote, v_req_class, v_quote, 'active'
            );
          end if;
        end loop;

        perform public.enqueue_evaluation(u.user_id, v_opp_id);
      end if;
      continue;
    end if;

    -- Insert raw item projection
    insert into public.raw_items(
      user_id, request_id, source_type, raw_content, status, is_opportunity, content_hash
    ) values (
      u.user_id, gen_random_uuid(), 'discovery',
      concat('DISCOVERED: ', v_title, ' from ', v_source_badge, E'\n', coalesce(p_item->>'raw_text', '')),
      'understood', true, v_content_hash
    ) on conflict (user_id, content_hash) where content_hash is not null
    do update set updated_at = now()
    returning id into v_raw_id;

    -- Insert opportunity projection
    insert into public.opportunities(
      user_id, fingerprint, title, organization, deadline, location, type,
      application_url, description, skills, ambiguity_flags, extracted_json,
      extraction_confidence, extraction_version, trust_tier, source_badge, catalog_id, risk_signals,
      seniority_level, requirements_status
    ) values (
      u.user_id, v_fp, v_title, p_item->>'organization',
      v_deadline,
      p_item->>'location', v_type, p_item->>'application_url',
      coalesce(p_item->>'raw_text', v_title),
      array(select jsonb_array_elements_text(v_skills)),
      v_risk_signals,
      p_item,
      0.85, 'discovery-v2', v_trust_tier, v_source_badge, v_cat_id, v_risk_signals,
      v_seniority,
      v_req_status
    ) on conflict (user_id, fingerprint) do update set
      title = excluded.title,
      skills = excluded.skills,
      extracted_json = excluded.extracted_json,
      deadline = excluded.deadline,
      trust_tier = excluded.trust_tier,
      risk_signals = excluded.risk_signals,
      description = excluded.description,
      seniority_level = excluded.seniority_level,
      requirements_status = excluded.requirements_status,
      catalog_id = excluded.catalog_id,
      updated_at = now()
    returning id into v_opp_id;

    if v_opp_id is not null and v_raw_id is not null then
      insert into public.opportunity_sources(user_id, opportunity_id, raw_item_id, extracted_json)
      values (u.user_id, v_opp_id, v_raw_id, p_item)
      on conflict do nothing;

      delete from public.opportunity_requirements where opportunity_id = v_opp_id and user_id = u.user_id;
      for req in select value from jsonb_array_elements(v_reqs) loop
        v_quote := coalesce(req->>'quote', req->>'evidence', '');
        if length(v_quote) > 0 and position(lower(v_quote) in lower(coalesce(p_item->>'raw_text', ''))) > 0 then
          v_kind := case
            when req->>'kind' in ('cgpa', 'academic_year', 'graduation_year', 'branch', 'degree', 'location', 'skill', 'other')
            then req->>'kind'
            else 'other'
          end;
          v_req_class := coalesce(req->>'requirement_class', case when coalesce((req->>'mandatory')::boolean, false) then 'mandatory_eligibility' else 'preferred_skill' end);
          insert into public.opportunity_requirements(
            user_id, opportunity_id, kind, value, mandatory, evidence_snippet, requirement_class, quote, status
          ) values (
            u.user_id, v_opp_id, v_kind, coalesce(req->>'value', v_quote),
            coalesce((req->>'mandatory')::boolean, false),
            v_quote, v_req_class, v_quote, 'active'
          );
        end if;
      end loop;

      perform public.enqueue_evaluation(u.user_id, v_opp_id);
      v_was_created := true;
    end if;
  end loop;

  return jsonb_build_object(
    'saved', true,
    'catalog_id', v_cat_id,
    'was_created', v_existing_id is null,
    'was_updated', v_existing_id is not null and v_existing_hash is distinct from v_content_hash
  );
end; $$;

revoke all on function public.worker_save_discovery_item(uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.worker_save_discovery_item(uuid,jsonb,uuid) to service_role;

-- 2. Update backfill_profile_catalog to refresh requirements on existing opportunities
create or replace function opportunityos_private.backfill_profile_catalog(p_user uuid)
returns int language plpgsql security definer set search_path='' as $$
declare
  p public.profiles%rowtype;
  c record;
  v_raw uuid;
  v_opp uuid;
  inserted int := 0;
  fp text;
  v_skills text[];
  req jsonb;
  v_req_class text;
  v_quote text;
  v_kind text;
  v_projection_hash text;
  v_cat_reqs jsonb;
begin
  select * into p from public.profiles where user_id = p_user;
  if not found then return 0; end if;

  select coalesce(array_agg(s.canonical_name), '{}'::text[]) into v_skills
  from public.profile_skills ps
  join public.skills s on s.id = ps.skill_id
  where ps.user_id = p_user;

  for c in
    select cat.*, coalesce(reg.source_badge, reg.name) as badge
    from opportunityos_private.catalog_opportunities cat
    join opportunityos_private.source_registry reg on reg.id = cat.source_id
    where reg.status = 'active'
      and reg.superseded_by is null
      and (cardinality(p.interest_types) = 0 or cat.type = any(p.interest_types))
      and (cat.deadline is null or cat.deadline >= current_date)
      and (cat.seniority_level is null or cat.seniority_level not in ('senior', 'executive'))
      and (
        cat.type = 'hackathon'
        or coalesce(cat.location, '') !~* '(london|san francisco|seattle|austin|dublin|ireland|germany|berlin|france|paris|united kingdom|united states|usa|canada|toronto|vancouver|australia|sydney|singapore|tokyo|japan)'
        or coalesce(cat.location, '') ~* '(india|bengaluru|bangalore|hyderabad|pune|mumbai|delhi|noida|gurugram|chennai|kolkata|remote|worldwide)'
      )
      and not exists (
        select 1 from public.user_source_preferences sp
        where sp.user_id = p_user
          and sp.source_identifier = lower(cat.organization)
          and sp.preference = 'muted'
      )
      and public.profile_domain_matches(
        cat.title,
        cat.type,
        case when jsonb_typeof(cat.structured_fields->'skills') = 'array'
             then array(select jsonb_array_elements_text(cat.structured_fields->'skills'))
             else '{}'::text[] end,
        p.branch,
        v_skills
      )
    order by case when cat.type = 'internship' then 0 when cat.type = 'hackathon' then 1 else 2 end,
             cat.updated_at desc, cat.id
    limit 100
  loop
    v_cat_reqs := coalesce(c.structured_fields->'requirements', '[]'::jsonb);

    -- Check if opportunity already exists for this user and catalog item
    select id, extracted_json->>'content_hash' into v_opp, v_projection_hash
    from public.opportunities
    where user_id = p_user and catalog_id = c.id
    order by created_at, id limit 1;

    if found then
      -- Refresh if content changed or if opportunity lacks requirements while catalog has them
      if c.content_hash is distinct from v_projection_hash
         or not exists (select 1 from public.opportunity_requirements r where r.opportunity_id = v_opp and r.user_id = p_user)
         or jsonb_array_length(v_cat_reqs) > 0
      then
        update public.opportunities set
          description = coalesce(c.raw_text, title),
          skills = case when jsonb_typeof(c.structured_fields->'skills') = 'array'
                        then array(select jsonb_array_elements_text(c.structured_fields->'skills'))
                        else skills end,
          extracted_json = jsonb_build_object('content_hash', c.content_hash, 'fields', c.structured_fields, 'field_provenance', c.field_provenance),
          requirements_status = coalesce(c.requirements_status, 'REQUIREMENTS_PRESENT'),
          updated_at = now()
        where id = v_opp and user_id = p_user;

        delete from public.opportunity_requirements where opportunity_id = v_opp and user_id = p_user;
        for req in select value from jsonb_array_elements(v_cat_reqs) loop
          v_quote := coalesce(req->>'quote', req->>'evidence', '');
          if length(v_quote) > 0 and position(lower(v_quote) in lower(coalesce(c.raw_text, ''))) > 0 then
            v_kind := case
              when req->>'kind' in ('cgpa', 'academic_year', 'graduation_year', 'branch', 'degree', 'location', 'skill', 'other')
              then req->>'kind'
              else 'other'
            end;
            v_req_class := coalesce(req->>'requirement_class', case when coalesce((req->>'mandatory')::boolean, false) then 'mandatory_eligibility' else 'preferred_skill' end);
            insert into public.opportunity_requirements(
              user_id, opportunity_id, kind, value, mandatory, evidence_snippet, requirement_class, quote, status
            ) values (
              p_user, v_opp, v_kind, coalesce(req->>'value', v_quote),
              coalesce((req->>'mandatory')::boolean, false),
              v_quote, v_req_class, v_quote, 'active'
            );
          end if;
        end loop;

        perform public.enqueue_evaluation(p_user, v_opp);
      end if;
      continue;
    end if;

    fp := encode(extensions.digest(concat(p_user::text, ':catalog:', c.stable_key)::bytea, 'sha256'), 'hex');

    insert into public.raw_items(user_id, request_id, source_type, raw_content, status, is_opportunity, content_hash)
    values (
      p_user,
      gen_random_uuid(),
      'discovery',
      left(concat('DISCOVERED: ', c.title, ' from ', c.badge, E'\n', c.raw_text), 20000),
      'understood',
      true,
      c.content_hash
    )
    on conflict (user_id, content_hash) where content_hash is not null
    do update set updated_at = now()
    returning id into v_raw;

    insert into public.opportunities(
      user_id, fingerprint, title, organization, deadline, location, type, application_url, description,
      skills, ambiguity_flags, extracted_json, extraction_confidence, extraction_version, trust_tier,
      source_badge, catalog_id, risk_signals, seniority_level, requirements_status
    ) values (
      p_user, fp, c.title, c.organization, c.deadline, c.location, c.type, c.application_url, c.raw_text,
      case when jsonb_typeof(c.structured_fields->'skills') = 'array'
           then array(select jsonb_array_elements_text(c.structured_fields->'skills'))
           else '{}'::text[] end,
      '{}'::text[],
      jsonb_build_object('content_hash', c.content_hash, 'fields', c.structured_fields, 'field_provenance', c.field_provenance),
      0.85, 'discovery-v2', c.trust_tier, c.badge, c.id, c.risk_signals, c.seniority_level,
      coalesce(c.requirements_status, 'REQUIREMENTS_PRESENT')
    )
    on conflict (user_id, fingerprint) do update set
      title = excluded.title,
      skills = excluded.skills,
      extracted_json = excluded.extracted_json,
      deadline = excluded.deadline,
      trust_tier = excluded.trust_tier,
      risk_signals = excluded.risk_signals,
      description = excluded.description,
      seniority_level = excluded.seniority_level,
      requirements_status = excluded.requirements_status,
      catalog_id = excluded.catalog_id,
      updated_at = now()
    returning id into v_opp;

    if v_opp is null then continue; end if;

    insert into public.opportunity_sources(user_id, opportunity_id, raw_item_id, extracted_json)
    values (
      p_user, v_opp, v_raw,
      jsonb_build_object('content_hash', c.content_hash, 'fields', c.structured_fields, 'field_provenance', c.field_provenance)
    )
    on conflict do nothing;

    delete from public.opportunity_requirements where opportunity_id = v_opp and user_id = p_user;
    for req in select value from jsonb_array_elements(v_cat_reqs) loop
      v_quote := coalesce(req->>'quote', req->>'evidence', '');
      if length(v_quote) > 0 and position(lower(v_quote) in lower(coalesce(c.raw_text, ''))) > 0 then
        v_kind := case
          when req->>'kind' in ('cgpa', 'academic_year', 'graduation_year', 'branch', 'degree', 'location', 'skill', 'other')
          then req->>'kind'
          else 'other'
        end;
        v_req_class := coalesce(req->>'requirement_class', case when coalesce((req->>'mandatory')::boolean, false) then 'mandatory_eligibility' else 'preferred_skill' end);
        insert into public.opportunity_requirements(
          user_id, opportunity_id, kind, value, mandatory, evidence_snippet, requirement_class, quote, status
        ) values (
          p_user, v_opp, v_kind, coalesce(req->>'value', v_quote),
          coalesce((req->>'mandatory')::boolean, false),
          v_quote, v_req_class, v_quote, 'active'
        );
      end if;
    end loop;

    perform public.enqueue_evaluation(p_user, v_opp);
    inserted := inserted + 1;
  end loop;

  return inserted;
end $$;

revoke all on function opportunityos_private.backfill_profile_catalog(uuid) from public, anon, authenticated;

commit;
