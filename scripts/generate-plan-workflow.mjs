import { workflowBuilder } from './workflow-builder.mjs';
import fs from 'node:fs';

const plannerJsCode = fs.readFileSync('scripts/planner-contract.mjs', 'utf8')
  .replace(/^export\s+/gm, '');

const embeddedPlanner = `
// Embedded Deterministic Planner
${plannerJsCode}
`;

const b = workflowBuilder('opportunityosSlice6Plan', 'OpportunityOS 09 Weekly Plan');
const { add, pg, code, link } = b;

// 1. Triggers
add('trigger', 'Execute weekly plan', 'executeWorkflowTrigger', 1.1, 0, 0, { inputSource: 'passthrough' });
add('manual', 'Manual plan generation', 'manualTrigger', 1, 0, 160, {});

// 2. Query Postgres: fetch user availability, profile revision, and current opportunities + matches
const queryContext = `
with target_user as materialized (
  select coalesce(nullif($1::text, ''), (select id::text from auth.users order by created_at asc limit 1))::uuid as user_id,
         coalesce(nullif($2::text, ''), to_char(date_trunc('week', current_date) + interval '1 day', 'YYYY-MM-DD')) as week_start
),
avail as (
  select a.* from public.user_availability a join target_user u on u.user_id = a.user_id
),
prof as (
  select p.revision as profile_revision from public.profiles p join target_user u on u.user_id = p.user_id
),
opps as (
  select jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'title', o.title,
      'organization', o.organization,
      'deadline', o.deadline,
      'type', o.type,
      'trust_tier', coalesce(o.trust_tier, 'unverified'),
      'risk_flags', to_jsonb(coalesce(o.risk_signals, '{}'::text[])),
      'match_score', m.match_score,
      'eligibility', coalesce(m.eligibility_status, 'UNKNOWN'),
      'match_revision', m.revision
    )
  ) as candidates
  from public.opportunities o
  join target_user u on u.user_id = o.user_id
  left join public.matches m on m.opportunity_id = o.id and m.user_id = o.user_id and m.status = 'complete'
)
select jsonb_build_object(
  'user_id', (select user_id from target_user),
  'week_start', (select week_start from target_user),
  'profile_revision', coalesce((select profile_revision from prof), 1),
  'availability', coalesce((select to_jsonb(a) from avail a), '{"weekly_budget_hours": 10, "working_windows": [{"day": 1, "start": "09:00", "end": "12:00"}], "busy_blocks": [], "timezone": "Asia/Kolkata", "revision": 1}'::jsonb),
  'candidates', coalesce((select candidates from opps), '[]'::jsonb)
) as context;
`;

pg('context', 'Load student planning context', 240, 0, queryContext, '={{ [$json.user_id || "", $json.week_start || ""] }}');

// 3. Deterministic Planner Code Node
const plannerCode = `
${embeddedPlanner}

const rawContext = $input.first().json.context;
if (!rawContext || !rawContext.user_id) {
  return [];
}

const planResult = generateWeeklyPlan({
  candidates: rawContext.candidates || [],
  availability: rawContext.availability || {},
  weekStart: rawContext.week_start,
  profileRevision: rawContext.profile_revision || 1,
  customEstimates: {},
  priorities: {}
});

return [{
  json: {
    user_id: rawContext.user_id,
    plan_week_start: rawContext.week_start,
    contract_version: planResult.contract_version,
    algorithm_version: planResult.algorithm_version,
    profile_revision: planResult.profile_revision,
    availability_revision: planResult.availability_revision,
    scheduled_items: planResult.scheduled_items,
    unscheduled_items: planResult.unscheduled_items,
    pressure_notes: planResult.pressure_notes,
    total_scheduled_minutes: planResult.total_scheduled_minutes,
    budget_minutes: planResult.budget_minutes
  }
}];
`;

code('plan', 'Generate deterministic weekly plan', 480, 0, plannerCode);

// 4. Save Draft Weekly Plan in Postgres
const saveDraftSql = `
insert into public.weekly_plans (
  user_id,
  plan_week_start,
  contract_version,
  algorithm_version,
  profile_revision,
  availability_revision,
  status,
  scheduled_items,
  unscheduled_items,
  pressure_notes
)
values (
  $1::uuid,
  $2::date,
  $3::text,
  $4::text,
  $5::integer,
  $6::integer,
  'draft',
  $7::jsonb,
  $8::jsonb,
  $9::jsonb
)
returning id, status, plan_week_start, created_at;
`;

pg('save', 'Store draft weekly plan in database', 720, 0, saveDraftSql,
  '={{ [$json.user_id, $json.plan_week_start, $json.contract_version, $json.algorithm_version, $json.profile_revision, $json.availability_revision, JSON.stringify($json.scheduled_items), JSON.stringify($json.unscheduled_items), JSON.stringify($json.pressure_notes)] }}'
);

// Wiring
link('Execute weekly plan', 'Load student planning context');
link('Manual plan generation', 'Load student planning context');
link('Load student planning context', 'Generate deterministic weekly plan');
link('Generate deterministic weekly plan', 'Store draft weekly plan in database');

add('note', 'Deterministic Weekly Planner', 'stickyNote', 1, 240, -320, {
  content: '## Slice S6 Deterministic Weekly Planner\\nRuns pure code scheduling respecting 30-minute windows, verified capacity, confirmed deadlines, and exam/busy blocks. Rejects UNKNOWN/ineligible items. Zero AI tokens.',
  width: 700,
  height: 200
});

b.save('09-plan.json');
console.log('✓ Generated workflows/09-plan.json and runtime variant successfully.');
