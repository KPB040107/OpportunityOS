-- Migration 0029: Eligibility clarifications grouped updates and no-deadline approval repair
begin;

-- 1. Ensure public.profiles has revision tracking
alter table public.profiles add column if not exists revision bigint not null default 1;

-- 2. Clarification recurring history: permit history while enforcing single active pending question per fact
alter table public.clarifications drop constraint if exists uq_user_missing_fact;
drop index if exists public.uq_active_user_clarification;
create unique index if not exists uq_active_user_clarification 
  on public.clarifications (user_id, missing_fact) 
  where status = 'pending';

-- 3. Grouping clarification helper: groups missing facts into precise questions affecting multiple opportunities
create or replace function public.record_or_group_clarification(
  p_user_id uuid,
  p_missing_fact text,
  p_requirement_kind text,
  p_question_text text,
  p_opportunity_id uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_id uuid;
  v_owner uuid;
begin
  if p_user_id is null or length(trim(p_missing_fact)) = 0 then
    raise exception 'Invalid clarification parameters';
  end if;

  -- Validate caller has permission: must be service_role or the user themselves
  if auth.role() <> 'service_role' and auth.uid() <> p_user_id then
    raise exception 'Unauthorized to record clarification';
  end if;

  -- Validate ownership of the opportunity if provided
  if p_opportunity_id is not null then
    select user_id into v_owner from public.opportunities where id = p_opportunity_id;
    if v_owner is distinct from p_user_id then
      raise exception 'Opportunity not owned by user';
    end if;
  end if;

  -- Look for an existing pending clarification for this user and missing fact
  select id into v_id 
  from public.clarifications
  where user_id = p_user_id 
    and missing_fact = p_missing_fact 
    and status = 'pending'
  for update;

  if found then
    -- Append opportunity_id if not already in array
    if p_opportunity_id is not null then
      update public.clarifications
      set affected_opportunity_ids = array(
        select distinct unnest(affected_opportunity_ids || array[p_opportunity_id])
      ),
      updated_at = now()
      where id = v_id;
    end if;
  else
    -- Insert new pending clarification
    insert into public.clarifications (
      user_id,
      missing_fact,
      requirement_kind,
      question_text,
      affected_opportunity_ids,
      status
    ) values (
      p_user_id,
      p_missing_fact,
      p_requirement_kind,
      p_question_text,
      case when p_opportunity_id is not null then array[p_opportunity_id] else '{}'::uuid[] end,
      'pending'
    )
    returning id into v_id;
  end if;

  return v_id;
end; $$;

revoke all on function public.record_or_group_clarification(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.record_or_group_clarification(uuid, text, text, text, uuid) to authenticated, service_role;

-- 4. Re-implement resolve_clarification: atomically updates profile, increments revision, verifies ownership, and re-evaluates
create or replace function public.resolve_clarification(p_id uuid, p_answer jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c public.clarifications%rowtype;
  opp_id uuid;
  count int := 0;
  v_fact text;
  v_val text;
  v_val_num numeric;
  v_val_int int;
  v_skill_name text;
  v_skill_level text;
  v_skill_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('resolved', false, 'error', 'Not authenticated');
  end if;

  -- Lock the pending clarification for the authenticated user
  select * into c 
  from public.clarifications 
  where id = p_id 
    and user_id = auth.uid() 
    and status = 'pending' 
  for update;

  if not found then 
    return jsonb_build_object('resolved', false, 'error', 'Clarification not found or already resolved'); 
  end if;

  if p_answer is null or p_answer = '{}'::jsonb then
    return jsonb_build_object('resolved', false, 'error', 'Answer cannot be empty');
  end if;

  v_fact := lower(trim(c.missing_fact));

  -- Ensure profile row exists
  insert into public.profiles (user_id) values (c.user_id)
  on conflict (user_id) do nothing;

  -- Apply confirmed answer to profile fields atomically
  if v_fact in ('cgpa', 'gpa') or c.requirement_kind = 'cgpa' then
    v_val_num := coalesce(
      (p_answer->>'cgpa')::numeric,
      (p_answer->>'value')::numeric,
      (p_answer->>'gpa')::numeric
    );
    if v_val_num is not null and v_val_num between 0 and 10 then
      update public.profiles
      set cgpa = v_val_num,
          revision = coalesce(revision, 1) + 1,
          updated_at = now()
      where user_id = c.user_id;
    end if;

  elsif v_fact in ('academic_year', 'year') or c.requirement_kind in ('academic_year', 'year') then
    v_val_int := coalesce(
      (p_answer->>'academic_year')::int,
      (p_answer->>'year')::int,
      (p_answer->>'value')::int
    );
    if v_val_int is not null and v_val_int between 1 and 8 then
      update public.profiles
      set academic_year = v_val_int,
          revision = coalesce(revision, 1) + 1,
          updated_at = now()
      where user_id = c.user_id;
    end if;

  elsif v_fact in ('graduation_year') or c.requirement_kind = 'graduation_year' then
    v_val_int := coalesce(
      (p_answer->>'graduation_year')::int,
      (p_answer->>'value')::int
    );
    if v_val_int is not null and v_val_int between 2000 and 2100 then
      update public.profiles
      set graduation_year = v_val_int,
          revision = coalesce(revision, 1) + 1,
          updated_at = now()
      where user_id = c.user_id;
    end if;

  elsif v_fact in ('degree') or c.requirement_kind = 'degree' then
    v_val := coalesce(p_answer->>'degree', p_answer->>'value');
    if v_val is not null and length(trim(v_val)) between 1 and 100 then
      update public.profiles
      set degree = trim(v_val),
          revision = coalesce(revision, 1) + 1,
          updated_at = now()
      where user_id = c.user_id;
    end if;

  elsif v_fact in ('branch', 'major') or c.requirement_kind in ('branch', 'major') then
    v_val := coalesce(p_answer->>'branch', p_answer->>'major', p_answer->>'value');
    if v_val is not null and length(trim(v_val)) between 1 and 100 then
      update public.profiles
      set branch = trim(v_val),
          revision = coalesce(revision, 1) + 1,
          updated_at = now()
      where user_id = c.user_id;
    end if;

  elsif v_fact in ('skills', 'skill') or c.requirement_kind in ('skills', 'skill') then
    v_skill_name := coalesce(p_answer->>'skill', p_answer->>'name', p_answer->>'value');
    v_skill_level := coalesce(p_answer->>'level', 'intermediate');
    if v_skill_level not in ('beginner', 'intermediate', 'advanced') then
      v_skill_level := 'intermediate';
    end if;
    if v_skill_name is not null and length(trim(v_skill_name)) > 0 then
      insert into public.skills (name, canonical_name)
      values (trim(v_skill_name), lower(trim(v_skill_name)))
      on conflict (canonical_name) do update set name = excluded.name
      returning id into v_skill_id;

      insert into public.profile_skills (user_id, skill_id, level)
      values (c.user_id, v_skill_id, v_skill_level)
      on conflict (user_id, skill_id) do update set level = excluded.level;

      update public.profiles
      set revision = coalesce(revision, 1) + 1,
          updated_at = now()
      where user_id = c.user_id;
    end if;
  else
    -- Generic profile revision increment
    update public.profiles
    set revision = coalesce(revision, 1) + 1,
        updated_at = now()
    where user_id = c.user_id;
  end if;

  -- Mark clarification as resolved
  update public.clarifications 
  set status = 'resolved', 
      answer = p_answer, 
      resolved_at = now(), 
      updated_at = now() 
  where id = c.id;

  -- Verify ownership of EVERY affected opportunity and queue bounded re-evaluation
  if c.affected_opportunity_ids is not null then
    foreach opp_id in array c.affected_opportunity_ids loop
      if exists (select 1 from public.opportunities where id = opp_id and user_id = c.user_id) then
        perform public.enqueue_evaluation(c.user_id, opp_id);
        count := count + 1;
      end if;
    end loop;
  end if;

  insert into public.events(user_id, stage, level, message, metadata)
  values(
    c.user_id, 
    'evaluate', 
    'info', 
    'Clarification resolved: ' || c.missing_fact, 
    jsonb_build_object('clarification_id', c.id, 'reevaluated_count', count, 'answer', p_answer)
  );

  return jsonb_build_object('resolved', true, 'reevaluated_count', count);
end; $$;

revoke all on function public.resolve_clarification(uuid, jsonb) from public, anon;
grant execute on function public.resolve_clarification(uuid, jsonb) to authenticated;

-- 5. Re-implement confirm_approval: supports eligible no-deadline opportunities within 48h approval expiry
create or replace function public.confirm_approval(p_id uuid, p_revision bigint, p_outcome text, p_reason text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a public.approvals%rowtype;
  m public.matches%rowtype;
  owner_id uuid := auth.uid();
begin
  if owner_id is null or p_outcome not in ('approved','rejected') or length(p_reason) > 2000 then 
    raise exception 'Invalid authenticated decision';
  end if;

  select * into a from public.approvals where id = p_id and user_id = owner_id and match_revision = p_revision for update;
  if not found then 
    raise exception 'Approval not found';
  end if;

  if a.status <> 'pending' then 
    return jsonb_build_object('accepted', false, 'reason', 'ALREADY_RESOLVED');
  end if;

  if a.expires_at <= now() then 
    update public.approvals set status = 'expired', resume_status = 'expired' where id = a.id;
    return jsonb_build_object('accepted', false, 'reason', 'EXPIRED');
  end if;

  select * into m from public.matches where id = a.match_id and user_id = owner_id and revision = a.match_revision and status = 'complete' for update;
  if m.id is null then 
    update public.approvals set status = 'stale', resume_status = 'stale' where id = a.id;
    return jsonb_build_object('accepted', false, 'reason', 'STALE');
  end if;

  -- Block approval if information is missing or eligibility is not ELIGIBLE
  if p_outcome = 'approved' and (a.requires_information or m.eligibility_status <> 'ELIGIBLE') then 
    return jsonb_build_object('accepted', false, 'reason', 'CORRECT_INFORMATION_REQUIRED');
  end if;

  -- Allow opportunities where deadline is null (e.g. jobs/internships with no stated deadline) or in the future
  if p_outcome = 'approved' and not exists(
    select 1 from public.opportunities 
    where id = m.opportunity_id 
      and user_id = owner_id 
      and (deadline is null or deadline > (now() at time zone 'Asia/Kolkata')::date)
  ) then 
    return jsonb_build_object('accepted', false, 'reason', 'EXPIRED');
  end if;

  if not exists(select 1 from opportunityos_private.approval_execution where approval_id = a.id) then 
    return jsonb_build_object('accepted', false, 'reason', 'EXECUTION_UNBOUND');
  end if;

  update public.approvals set status = p_outcome, decided_at = now(), updated_at = now(), resume_status = 'pending' where id = a.id;
  insert into public.user_feedback(user_id, match_id, outcome, reason) values (owner_id, m.id, p_outcome, p_reason);
  insert into public.events(user_id, stage, level, message, metadata) values (owner_id, 'approval', 'info', 'Review decision recorded: ' || p_outcome, jsonb_build_object('approval_id', a.id, 'match_id', m.id));

  return jsonb_build_object('accepted', true, 'resume_status', 'pending');
end; $$;

revoke all on function public.confirm_approval(uuid, bigint, text, text) from public, anon;
grant execute on function public.confirm_approval(uuid, bigint, text, text) to authenticated;

commit;
