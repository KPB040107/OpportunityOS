import { readFileSync, writeFileSync } from 'node:fs';

const runtime = process.argv.includes('--runtime');
const config = runtime
  ? Object.fromEntries(
      readFileSync(new URL('../web/.env.local', import.meta.url), 'utf8')
        .split(/\r?\n/)
        .filter(l => l.includes('='))
        .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
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

// 1. Error Trigger
add('errorTrigger', 'Global Workflow Error Trigger', 'errorTrigger', 1, 0, 0, {});

// 2. Code: Sanitize Error and Format Event Payload
code('sanitizeError', 'Sanitize Error Message', 240, 0, `
  const err = $json.execution?.error || {};
  let msg = err.message || 'Unknown execution error';
  
  // Redact JWT tokens
  msg = msg.replace(/eyJ[a-zA-Z0-9_-]{10,}\\.[a-zA-Z0-9_-]{10,}\\.[a-zA-Z0-9_-]{10,}/g, '[REDACTED_JWT]');
  // Redact Bearer tokens
  msg = msg.replace(/Bearer\\s+[a-zA-Z0-9._~+/-]+=*/gi, 'Bearer [REDACTED_TOKEN]');
  // Redact postgres connection strings
  msg = msg.replace(/postgres(?:ql)?:\\/\\/[^:]+:[^@]+@[^\\s]+/gi, 'postgres://[REDACTED_DB_CREDENTIALS]');

  const workflowName = $json.workflow?.name || 'Unknown Workflow';
  const nodeName = err.node?.name || 'Unknown Node';
  const execId = $json.execution?.id || 'unknown';

  return [{
    json: {
      workflow_name: workflowName,
      node_name: nodeName,
      execution_id: execId,
      error_message: msg,
      summary: \`Error in workflow "\${workflowName}" at node "\${nodeName}": \${msg}\`
    }
  }];
`);

// 3. Postgres: Record Error Heartbeat in agent_runs
pg('recordErrorHeartbeat', 'Record Error in Agent Runs', 480, 0, `
  insert into public.agent_runs(workflow, status, items_processed, error_message, details)
  values(
    $1,
    'error',
    0,
    $2,
    jsonb_build_object(
      'execution_id', $3,
      'node_name', $4
    )
  )
`, '={{ $json.workflow_name }},{{ $json.error_message }},{{ $json.execution_id }},{{ $json.node_name }}');

add('note', 'Slice 5 Error Handler Boundaries', 'stickyNote', 1, 120, -180, {
  content: '## OpportunityOS 07 Error Handler\nCatches uncaught errors across workflow executions, sanitizes secrets/JWT tokens, and writes failure records to agent_runs and events.',
  width: 520,
  height: 140
});

// Link by node NAME
link('Global Workflow Error Trigger', 'Sanitize Error Message');
link('Sanitize Error Message', 'Record Error in Agent Runs');

const workflow = {
  id: 'opportunityosSlice5ErrorHandler',
  name: 'OpportunityOS 07 Error Handler',
  active: false,
  settings: {
    executionOrder: 'v1',
    executionTimeout: 300,
    saveDataSuccessExecution: 'none',
    saveDataErrorExecution: 'none',
    saveManualExecutions: false
  },
  nodes,
  connections,
  pinData: {},
  tags: []
};

const targetPath = new URL(runtime ? '../.local/07-error-handler.runtime.json' : '../workflows/07-error-handler.json', import.meta.url);
writeFileSync(targetPath, JSON.stringify(workflow, null, 2) + '\n');
console.log('Saved', runtime ? '.local/07-error-handler.runtime.json' : 'workflows/07-error-handler.json');
