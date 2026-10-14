import {workflowBuilder} from './workflow-builder.mjs';
import {normalizeLeverItem, normalizeDevpostItem, detectRiskSignals, parseDevpostDeadline} from './discovery-adapters.mjs';

const b = workflowBuilder('opportunityosSlice2Discovery', 'OpportunityOS 08 Discovery');
const {add, pg, code, branch, link, child, save} = b;

// 1. Triggers
add('schedule', 'Scan active discovery sources', 'scheduleTrigger', 1.2, 0, 0, {
  rule: {interval: [{field: 'hours', hoursInterval: 6}]}
});
add('manual', 'Manual discovery scan', 'manualTrigger', 1, 0, -160, {});
add('trigger', 'Execute discovery scan', 'executeWorkflowTrigger', 1.1, 0, 160, {inputSource: 'passthrough'});

// 2. Claim due source
pg('claim', 'Claim due source from registry', 240, 0, 'select public.worker_claim_due_discovery() as result;');
code('unpack', 'Check claimed source', 460, 0, 'const r = $input.first().json.result; return r?.claimed ? [{json: r}] : [];');
branch('claimed', 'Source was claimed?', 680, 0, '={{ !!$json.run_id }}');

// 3. Adapter routing
add('adapter-switch', 'Route by adapter', 'switch', 3.3, 900, 0, {
  mode: 'rules',
  rules: {
    values: [
      {
        conditions: {
          options: {caseSensitive: true, typeValidation: 'strict', version: 2},
          conditions: [{id: 'lever', leftValue: '={{ $json.adapter }}', rightValue: 'lever-v1', operator: {type: 'string', operation: 'equals'}}],
          combinator: 'and'
        },
        renameOutput: true,
        outputKey: 'lever'
      },
      {
        conditions: {
          options: {caseSensitive: true, typeValidation: 'strict', version: 2},
          conditions: [{id: 'devpost', leftValue: '={{ $json.adapter }}', rightValue: 'devpost-v1', operator: {type: 'string', operation: 'equals'}}],
          combinator: 'and'
        },
        renameOutput: true,
        outputKey: 'devpost'
      }
    ]
  },
  options: {}
});

// 4. Lever Path
add('fetch-lever', 'Fetch Lever company postings', 'httpRequest', 4.2, 1140, -120, {
  method: 'GET',
  url: '={{ "https://api.lever.co/v0/postings/" + $json.config.company + "?mode=json" }}',
  options: {timeout: 10000, response: {response: {neverError: true, responseFormat: 'json'}}}
}, {onError: 'continueRegularOutput', retryOnFail: false});

code('normalize-lever', 'Normalize Lever postings', 1380, -120, `
  const crypto = require('crypto');
  function hashString(str) { return crypto.createHash('sha256').update(String(str || '')).digest('hex'); }
  const detectRiskSignals = ${detectRiskSignals.toString()};
  const helper = ${normalizeLeverItem.toString()};
  const source = $('Check claimed source').first().json;
  const items = $input.all().map(i => i.json);
  const list = Array.isArray(items[0]) ? items[0] : items;
  const bounded = list.slice(0, 10);
  return bounded.map(item => ({
    json: {
      run_id: source.run_id,
      item: helper(source.config?.company || 'cred', item)
    }
  }));
`);

// 5. Devpost Path
add('fetch-devpost', 'Fetch Devpost hackathons', 'httpRequest', 4.2, 1140, 120, {
  method: 'GET',
  url: 'https://devpost.com/api/hackathons',
  options: {timeout: 10000, response: {response: {neverError: true, responseFormat: 'json'}}}
}, {onError: 'continueRegularOutput', retryOnFail: false});

code('normalize-devpost', 'Normalize Devpost hackathons', 1380, 120, `
  const crypto = require('crypto');
  function hashString(str) { return crypto.createHash('sha256').update(String(str || '')).digest('hex'); }
  const detectRiskSignals = ${detectRiskSignals.toString()};
  const parseDevpostDeadline = ${parseDevpostDeadline.toString()};
  const helper = ${normalizeDevpostItem.toString()};
  const source = $('Check claimed source').first().json;
  const raw = $input.first().json;
  const list = Array.isArray(raw?.hackathons) ? raw.hackathons : [];
  const bounded = list.slice(0, 10);
  return bounded.map(item => ({
    json: {
      run_id: source.run_id,
      item: helper(item)
    }
  }));
`);

// 6. Save Item to Catalog & Inboxes
pg('save-item', 'Save catalog item and project', 1640, 0,
  'select public.worker_save_discovery_item($1::uuid, $2::jsonb) as result;',
  '={{ [$json.run_id, JSON.stringify($json.item)] }}'
);

// 7. Complete Run
pg('finish', 'Complete discovery run', 1900, 0,
  "select public.worker_finish_discovery_run($1::uuid, 'ok', $2::int, $2::int, 0, null) as finished;",
  "={{ [$('Check claimed source').first().json.run_id, $input.all().length] }}"
);

// 8. Trigger evaluation for new items
child('trigger-eval', 'Trigger evaluation pipeline', 2140, 0, 'opportunityosSlice3Evaluate');

// Wiring
for (const t of ['Scan active discovery sources', 'Manual discovery scan', 'Execute discovery scan']) {
  link(t, 'Claim due source from registry');
}
link('Claim due source from registry', 'Check claimed source');
link('Check claimed source', 'Source was claimed?');
link('Source was claimed?', 'Route by adapter');

link('Route by adapter', 'Fetch Lever company postings', 0);
link('Fetch Lever company postings', 'Normalize Lever postings');
link('Normalize Lever postings', 'Save catalog item and project');

link('Route by adapter', 'Fetch Devpost hackathons', 1);
link('Fetch Devpost hackathons', 'Normalize Devpost hackathons');
link('Normalize Devpost hackathons', 'Save catalog item and project');

link('Save catalog item and project', 'Complete discovery run');
link('Complete discovery run', 'Trigger evaluation pipeline');

add('note', 'Autonomous Discovery Pipeline', 'stickyNote', 1, 600, -380, {
  content: '## Scheduled & On-Demand Discovery\\nFetches from official zero-auth company feeds (Lever) and hackathons (Devpost). Bounded to 10 items per dispatch. Structured fields mapped in code with zero LLM tokens. Preserves tiered trust: corroborated (company feeds) vs attributed (Devpost) vs unverified (fee/credential risk signals). Drops non-internship/job/hackathon items. Projects to all registered users and triggers evaluation.',
  width: 900,
  height: 200
});

save('08-discovery.json');
