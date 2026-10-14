-- Migration 0023: Policy Unlock & Grouped Clarifications
-- Implements Decision D1 (missing-deadline low-risk actions) and D3 (profile info / grouped clarifications)
begin;

-- 1. Update worker_action_allowed to support missing-deadline policy
create or replace function public.worker_action_allowed(p_match uuid, p_type text, p_revision bigint) returns boolean language plpgsql security definer set search_path='' as $$
declare m public.matches%rowtype;o public.opportunities%rowtype;day_now date:=(now() at time zone 'Asia/Kolkata')::date;
begin
 select * into m from public.matches where id=p_match and revision=p_revision and status='complete';
 if not found then return false;end if;
 if p_type='error_notification' then return true;end if;
 if p_type='approval_notification' then return exists(select 1 from public.approvals where match_id=m.id and match_revision=m.revision and status='pending' and expires_at>now());end if;
 if m.eligibility_status is distinct from 'ELIGIBLE' or m.evaluation_day is distinct from day_now then return false;end if;
 select * into o from public.opportunities where id=m.opportunity_id and user_id=m.user_id;
 if not found then return false;end if;

 -- When opportunity has no stated deadline:
 if o.deadline is null then
  if o.type in ('internship', 'job') and p_type in ('tracker_update', 'email_notification') then
   return m.decision='ACT' or exists(select 1 from public.approvals where match_id=m.id and match_revision=m.revision and status='approved' and expires_at>now());
  end if;
  return false;
 end if;

 -- When opportunity has a stated deadline:
 if o.deadline <= day_now then return false;end if;
 if p_type in ('deadline_reminder', 'followup_notification') then
  return exists(select 1 from public.applications where user_id=m.user_id and opportunity_id=m.opportunity_id and status in ('saved','to_apply','applied','assessment','interview'));
 end if;
 return m.decision='ACT' or exists(select 1 from public.approvals where match_id=m.id and match_revision=m.revision and status='approved' and expires_at>now());
end; $$;

-- 2. Update worker_plan_actions to separate deadline vs no-deadline actions
create or replace function public.worker_plan_actions(p_match uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare kind text;queued int:=0;id uuid;m public.matches%rowtype;o public.opportunities%rowtype;
begin
 select * into m from public.matches where id=p_match;
 if not found then return jsonb_build_object('match_id',p_match,'queued',0);end if;
 select * into o from public.opportunities where id=m.opportunity_id and user_id=m.user_id;
 if not found then return jsonb_build_object('match_id',p_match,'queued',0);end if;

 if o.deadline is not null then
  foreach kind in array array['tracker_update','task_create','calendar_link','followup_schedule','calendar_event','email_notification'] loop
   id:=public.worker_queue_action(p_match,kind);if id is not null then queued:=queued+1;end if;
  end loop;
 else
  -- Missing deadline policy: queue only low-risk internal tracker and notification
  foreach kind in array array['tracker_update','email_notification'] loop
   id:=public.worker_queue_action(p_match,kind);if id is not null then queued:=queued+1;end if;
  end loop;
 end if;
 return jsonb_build_object('match_id',p_match,'queued',queued);
end; $$;

-- 3. Grouped Clarifications Table
create table if not exists public.clarifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 missing_fact text not null,
 requirement_kind text not null,
 question_text text not null,
 affected_opportunity_ids uuid[] not null default '{}',
 status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
 answer jsonb,
 resolved_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint uq_user_missing_fact unique (user_id, missing_fact, status)
);

alter table public.clarifications enable row level security;

-- Authenticated students can view and update their own clarifications
create policy "Users can view own clarifications" on public.clarifications
 for select to authenticated using (auth.uid() = user_id);

create policy "Users can update own clarifications" on public.clarifications
 for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- User resolution helper function: re-evaluates all affected opportunities atomically
create or replace function public.resolve_clarification(p_id uuid, p_answer jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.clarifications%rowtype;opp_id uuid;count int:=0;
begin
 select * into c from public.clarifications where id=p_id and user_id=auth.uid() and status='pending' for update;
 if not found then return jsonb_build_object('resolved', false, 'error', 'Clarification not found or already resolved'); end if;

 update public.clarifications set status='resolved', answer=p_answer, resolved_at=now(), updated_at=now() where id=c.id;

 -- Re-evaluate every affected opportunity for this student
 foreach opp_id in array c.affected_opportunity_ids loop
  perform public.enqueue_evaluation(c.user_id, opp_id);
  count:=count+1;
 end loop;

 insert into public.events(user_id, stage, level, message, metadata)
 values(c.user_id, 'evaluate', 'info', 'Clarification resolved: ' || c.missing_fact, jsonb_build_object('clarification_id', c.id, 'reevaluated_count', count));

 return jsonb_build_object('resolved', true, 'reevaluated_count', count);
end; $$;

revoke all on function public.resolve_clarification(uuid, jsonb) from public, anon;
grant execute on function public.resolve_clarification(uuid, jsonb) to authenticated;

commit;
