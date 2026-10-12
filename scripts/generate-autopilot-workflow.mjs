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

// 1. Triggers: Daily Schedule & Execute Trigger
add('schedTrigger', 'Daily Autopilot Schedule', 'scheduleTrigger', 1.2, 0, 0, {
  rule: { interval: [{ field: 'hours', hoursInterval: 24 }] }
});

add('execTrigger', 'Execute Autopilot on Demand', 'executeWorkflowTrigger', 1.1, 0, 160, {});

// 2. Fetch all users from profiles
pg('getUsers', 'Fetch Active Users', 240, 80, `
  select user_id from public.profiles
`);

// 3. Scan deadlines and followups per user
pg('scanDeadlines', 'Scan Upcoming Deadlines & Followups', 480, 80, `
  with deadlines as (
    select jsonb_agg(d) as items
    from public.get_upcoming_deadlines($1::uuid, 7) d
  ),
  followups as (
    select jsonb_agg(f) as items
    from public.claim_due_followups($1::uuid) f
  )
  select 
    $1::uuid as user_id,
    coalesce((select items from deadlines), '[]'::jsonb) as deadlines,
    coalesce((select items from followups), '[]'::jsonb) as followups
`, '={{ $json.user_id }}');

// 4. Code: Format Digest and Calculate Urgency
code('formatDigest', 'Format Digest and Calculate Heartbeat', 720, 80, `
  const user = $json.user_id;
  const deadlines = $json.deadlines || [];
  const followups = $json.followups || [];

  const urgentCount = deadlines.filter(d => (d.days_remaining ?? 99) <= 3).length;
  const subject = urgentCount > 0
    ? \`[OpportunityOS Alert] \${urgentCount} Upcoming Deadline(s) Need Attention\`
    : \`[OpportunityOS] Daily Deadline Digest (\${deadlines.length} opportunities)\`;

  const totalItems = deadlines.length + followups.length;

  return [{
    json: {
      user_id: user,
      subject,
      items_count: totalItems,
      deadlines_count: deadlines.length,
      followups_count: followups.length,
      deadlines,
      followups,
      next_run: new Date(Date.now() + 24 * 3600000).toISOString()
    }
  }];
`);

// 5. Postgres: Record Agent Heartbeat
pg('recordHeartbeat', 'Record Agent Heartbeat', 960, 80, `
  select public.record_agent_heartbeat(
    $1::uuid,
    '06-autopilot',
    'ok',
    $2::int,
    $3::timestamptz,
    null,
    jsonb_build_object(
      'deadlines_count', $4::int,
      'followups_count', $5::int
    )
  ) as run_id
`, '={{ $json.user_id }},{{ $json.items_count }},{{ $json.next_run }},{{ $json.deadlines_count }},{{ $json.followups_count }}');

add('note', 'Slice 5 Autopilot Boundaries', 'stickyNote', 1, 240, -220, {
  content: '## OpportunityOS 06 Autopilot\nDaily schedule trigger runs background deadline monitoring and claims due followups. Updates agent_runs heartbeat and logs events to activity timeline.',
  width: 720,
  height: 160
});

// Link nodes by NAME
link('Daily Autopilot Schedule', 'Fetch Active Users');
link('Execute Autopilot on Demand', 'Fetch Active Users');
link('Fetch Active Users', 'Scan Upcoming Deadlines & Followups');
link('Scan Upcoming Deadlines & Followups', 'Format Digest and Calculate Heartbeat');
link('Format Digest and Calculate Heartbeat', 'Record Agent Heartbeat');

const workflow = {
  id: 'opportunityosSlice5Autopilot',
  name: 'OpportunityOS 06 Autopilot',
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

const targetPath = new URL(runtime ? '../.local/06-autopilot.runtime.json' : '../workflows/06-autopilot.json', import.meta.url);
writeFileSync(targetPath, JSON.stringify(workflow, null, 2) + '\n');
console.log('Saved', runtime ? '.local/06-autopilot.runtime.json' : 'workflows/06-autopilot.json');
