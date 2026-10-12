import { readFileSync, writeFileSync } from 'node:fs';
import { createActionsContract } from './actions-contract.mjs';

const runtime = process.argv.includes('--runtime');
const config = runtime
  ? Object.fromEntries(
      readFileSync(new URL('../web/.env.local', import.meta.url), 'utf8')
        .split(/\r?\n/)
        .filter(l => l.includes('='))
        .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('='))])
    )
  : {};

const db = runtime
  ? { postgres: { id: config.N8N_POSTGRES_CREDENTIAL_ID, name: config.N8N_POSTGRES_CREDENTIAL_NAME } }
  : undefined;

const nodes = [], connections = {};

function add(id, name, type, version, x, y, parameters, extra = {}) {
  nodes.push({
    id,
    name,
    type: type.includes('.') ? type : 'n8n-nodes-base.' + type,
    typeVersion: version,
    position: [x, y],
    parameters,
    ...extra
  });
}

function link(a, b, index = 0, type = 'main') {
  connections[a] ??= {};
  connections[a][type] ??= [];
  connections[a][type][index] ??= [];
  connections[a][type][index].push({ node: b, type, index: 0 });
}

function pg(id, name, x, y, query, values) {
  add(id, name, 'postgres', 2.6, x, y, {
    operation: 'executeQuery',
    query,
    options: values ? { queryReplacement: values } : {}
  }, db ? { credentials: db } : {});
}

function code(id, name, x, y, jsCode) {
  add(id, name, 'code', 2, x, y, { jsCode });
}

function branch(id, name, x, y, expression) {
  add(id, name, 'if', 2.2, x, y, {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [{ id, leftValue: expression, rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
      combinator: 'and'
    },
    options: {}
  });
}

const contractCode = `const contract = (${createActionsContract.toString()})();`;

add('trigger', 'Execute Act workflow', 'executeWorkflowTrigger', 1.1, 0, 0, { inputSource: 'passthrough' });

code('build-keys', 'Generate idempotency keys and calendar payload', 240, 0, `${contractCode}
const item = $input.first().json;
const userId = item.user_id || item.input?.profile?.user_id;
const matchId = item.match_id || item.id;
const opp = item.opportunity || item.input?.opportunity || {};
const match = item.match || item.decision || {};

if (!userId || !matchId) throw new Error('MISSING_USER_OR_MATCH_ID');

const trackerKey = contract.idempotencyKey(userId, matchId, 'tracker_update');
const calKey = contract.idempotencyKey(userId, matchId, 'calendar_event');
const emailKey = contract.idempotencyKey(userId, matchId, 'email_notification');
const ics = contract.formatIcsEvent({
  title: opp.title,
  organization: opp.organization,
  deadline: opp.deadline,
  applicationUrl: opp.application_url,
  matchScore: match.match_score
});

return [{
  json: {
    ...item,
    user_id: userId,
    match_id: matchId,
    opportunity_id: opp.id,
    tracker_key: trackerKey,
    cal_key: calKey,
    email_key: emailKey,
    ics_content: ics,
    opp_title: opp.title || 'Untitled',
    opp_deadline: opp.deadline
  }
}];`);

pg('claim-tracker', 'Claim tracker update action', 480, 0,
  'select public.claim_action($1::uuid, $2::uuid, \'tracker_update\', $3::text) as result;',
  '={{ [$json.user_id, $json.match_id, $json.tracker_key] }}'
);

branch('is-first', 'Is first action execution?', 700, 0, '={{ !$json.result.is_duplicate }}');

pg('upsert-app', 'Add opportunity to application tracker', 920, -100,
  'select public.upsert_application_tracker($1::uuid, $2::uuid, \'to_apply\', \'Added automatically by OpportunityOS on ACT\') as app_id;',
  '={{ [$json.user_id, $json.opportunity_id] }}'
);

pg('schedule-followup', 'Schedule application deadline reminder', 1140, -100,
  'insert into public.followups(user_id, application_id, due_at, kind) values($1::uuid, $2::uuid, coalesce($3::timestamptz, now() + interval \'7 days\'), \'deadline_reminder\');',
  '={{ [$json.user_id, $json.app_id, $json.opp_deadline] }}'
);

pg('log-act-event', 'Log autonomous action in events timeline', 1360, -100,
  'insert into public.events(user_id, stage, level, message, related_ids) values($1::uuid, \'act\', \'info\', \'Added to application tracker and scheduled reminder\', jsonb_build_object(\'match_id\', $2::uuid, \'opportunity_id\', $3::uuid));',
  '={{ [$json.user_id, $json.match_id, $json.opportunity_id] }}'
);

pg('finish-tracker', 'Mark tracker action complete', 1580, -100,
  'select public.finish_action($1::text, \'done\', \'{"status":"tracked"}\'::jsonb, null);',
  '={{ [$json.tracker_key] }}'
);

code('summary-act', 'Return ACT execution summary', 1800, -100, `return [{
  json: {
    status: 'acted',
    user_id: $json.user_id,
    match_id: $json.match_id,
    opportunity_id: $json.opportunity_id,
    actions_executed: ['tracker_update', 'followup_schedule']
  }
}];`);

code('duplicate-stop', 'Duplicate action execution blocked', 920, 160, `return [{
  json: {
    status: 'duplicate_skipped',
    message: 'Action already recorded with idempotency key'
  }
}];`);

add('note', 'Slice 4 Act Workflow boundaries', 'stickyNote', 1, 300, -350, {
  content: '## OpportunityOS 04 Act Workflow\nAtomically claims action using idempotency key `user_id:match_id:action_type` to guarantee exactly-once side effects. Enforces the action safety policy: tracking, reminders, and notifications are permitted; external application submission is strictly prohibited.',
  width: 900,
  height: 180
});

link('Execute Act workflow', 'Generate idempotency keys and calendar payload');
link('Generate idempotency keys and calendar payload', 'Claim tracker update action');
link('Claim tracker update action', 'Is first action execution?');
link('Is first action execution?', 'Add opportunity to application tracker', 0);
link('Is first action execution?', 'Duplicate action execution blocked', 1);
link('Add opportunity to application tracker', 'Schedule application deadline reminder');
link('Schedule application deadline reminder', 'Log autonomous action in events timeline');
link('Log autonomous action in events timeline', 'Mark tracker action complete');
link('Mark tracker action complete', 'Return ACT execution summary');

const workflow = {
  id: 'opportunityosSlice4Act',
  name: 'OpportunityOS 04 Act',
  active: false,
  settings: {
    executionOrder: 'v1',
    executionTimeout: 300,
    saveDataErrorExecution: 'none',
    saveDataSuccessExecution: 'none',
    saveManualExecutions: false
  },
  nodes,
  connections,
  pinData: {},
  tags: []
};

writeFileSync(
  new URL(runtime ? '../.local/04-act.runtime.json' : '../workflows/04-act.json', import.meta.url),
  JSON.stringify(workflow, null, 2) + '\n'
);

console.log('Successfully generated Workflow 04 Act: workflows/04-act.json');
