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

add('trigger', 'Execute Ask workflow', 'executeWorkflowTrigger', 1.1, 0, 0, { inputSource: 'passthrough' });

code('prep-approval', 'Extract approval context', 240, 0, `const item = $input.first().json;
const userId = item.user_id || item.input?.profile?.user_id;
const matchId = item.match_id || item.id;
const opp = item.opportunity || item.input?.opportunity || {};
const match = item.match || item.decision || {};

const reason = match.explanation || 'Uncertain requirements or unverified deadline.';
const missing = (opp.ambiguity_flags || []).concat(match.reason_codes || []);

return [{
  json: {
    ...item,
    user_id: userId,
    match_id: matchId,
    opportunity_id: opp.id,
    approval_reason: reason,
    missing_info: missing
  }
}];`);

pg('create-approval', 'Create pending approval record', 480, 0,
  'select public.create_approval_request($1::uuid, $2::uuid, $3::text, $4::text[], null) as approval_id;',
  '={{ [$json.user_id, $json.match_id, $json.approval_reason, $json.missing_info] }}'
);

pg('log-ask-event', 'Log ASK event in events timeline', 700, 0,
  'insert into public.events(user_id, stage, level, message, related_ids) values($1::uuid, \'ask\', \'info\', \'Created approval request awaiting student review\', jsonb_build_object(\'match_id\', $2::uuid, \'approval_id\', $3::uuid));',
  '={{ [$json.user_id, $json.match_id, $json.approval_id] }}'
);

add('wait-approval', 'Wait for human approval or timeout', 'wait', 1.1, 920, 0, {
  resume: 'webhook',
  options: {
    limitWaitTime: {
      values: {
        maxUnit: 'days',
        maxValue: 7
      }
    }
  }
});

code('eval-decision', 'Parse resume decision', 1140, 0, `const item = $input.first().json;
const query = item.query || {};
const body = item.body || {};
const decision = query.decision || body.decision || item.decision || 'approved';
const isApproved = decision === 'approve' || decision === 'approved';

return [{
  json: {
    ...item,
    is_approved: isApproved,
    user_decision: isApproved ? 'approved' : 'rejected'
  }
}];`);

branch('check-approved', 'Did user approve?', 1360, 0, '={{ $json.is_approved }}');

pg('resolve-approved', 'Mark approval approved', 1580, -100,
  'select public.resolve_approval($1::uuid, \'approved\', \'User approved via email/webhook link\') as result;',
  '={{ [$json.approval_id] }}'
);

add('call-act', 'Execute Act Workflow on Approval', 'executeWorkflow', 1.2, 1800, -100, {
  workflowId: 'opportunityosSlice4Act',
  mode: 'choose',
  data: 'passthrough'
});

pg('resolve-rejected', 'Mark approval rejected', 1580, 160,
  'select public.resolve_approval($1::uuid, \'rejected\', \'User rejected via email/webhook link\') as result;',
  '={{ [$json.approval_id] }}'
);

code('summary-ask', 'Return ASK execution summary', 2020, -100, `return [{
  json: {
    status: 'approved_and_acted',
    approval_id: $json.approval_id,
    user_id: $json.user_id,
    match_id: $json.match_id
  }
}];`);

add('note', 'Slice 4 Ask and Approve boundaries', 'stickyNote', 1, 300, -350, {
  content: '## OpportunityOS 05 Ask and Approve Workflow\nPauses execution at the Wait node. When the student clicks `{{ $execution.resumeUrl }}?decision=approve` or resolves it from the Approval Center, execution resumes and calls Workflow 04 Act. If rejected, records feedback and terminates with zero side effects.',
  width: 950,
  height: 180
});

link('Execute Ask workflow', 'Extract approval context');
link('Extract approval context', 'Create pending approval record');
link('Create pending approval record', 'Log ASK event in events timeline');
link('Log ASK event in events timeline', 'Wait for human approval or timeout');
link('Wait for human approval or timeout', 'Parse resume decision');
link('Parse resume decision', 'Did user approve?');
link('Did user approve?', 'Mark approval approved', 0);
link('Did user approve?', 'Mark approval rejected', 1);
link('Mark approval approved', 'Execute Act Workflow on Approval');
link('Execute Act Workflow on Approval', 'Return ASK execution summary');

const workflow = {
  id: 'opportunityosSlice4Ask',
  name: 'OpportunityOS 05 Ask and approve',
  active: false,
  settings: {
    executionOrder: 'v1',
    executionTimeout: 86400 * 7,
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
  new URL(runtime ? '../.local/05-ask.runtime.json' : '../workflows/05-ask-and-approve.json', import.meta.url),
  JSON.stringify(workflow, null, 2) + '\n'
);

console.log('Successfully generated Workflow 05 Ask and approve: workflows/05-ask-and-approve.json');
