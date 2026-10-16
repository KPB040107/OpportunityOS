import {workflowBuilder} from './workflow-builder.mjs';
import {normalizeLeverItem, normalizeDevpostItem, normalizeGreenhouseItem, normalizeAshbyItem, normalizeJSearchItem, detectRiskSignals, parseDevpostDeadline, classifySeniority} from './discovery-adapters.mjs';

const b = workflowBuilder('opportunityosSlice2Discovery', 'OpportunityOS 08 Discovery');
const {runtime, config, add, pg, code, branch, link, child, save} = b;

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
      },
      {
        conditions: {
          options: {caseSensitive: true, typeValidation: 'strict', version: 2},
          conditions: [{id: 'greenhouse', leftValue: '={{ $json.adapter }}', rightValue: 'greenhouse-v1', operator: {type: 'string', operation: 'equals'}}],
          combinator: 'and'
        },
        renameOutput: true,
        outputKey: 'greenhouse'
      },
      {
        conditions: {
          options: {caseSensitive: true, typeValidation: 'strict', version: 2},
          conditions: [{id: 'ashby', leftValue: '={{ $json.adapter }}', rightValue: 'ashby-v1', operator: {type: 'string', operation: 'equals'}}],
          combinator: 'and'
        },
        renameOutput: true,
        outputKey: 'ashby'
      },
      {
        conditions: {
          options: {caseSensitive: true, typeValidation: 'strict', version: 2},
          conditions: [{id: 'jsearch', leftValue: '={{ $json.adapter }}', rightValue: 'jsearch-v1', operator: {type: 'string', operation: 'equals'}}],
          combinator: 'and'
        },
        renameOutput: true,
        outputKey: 'jsearch'
      }
    ]
  },
  options: {}
});

// 4. Lever Path
add('fetch-lever', 'Fetch Lever company postings', 'httpRequest', 4.2, 1140, -180, {
  method: 'GET',
  url: '={{ "https://api.lever.co/v0/postings/" + $json.config.company + "?mode=json" }}',
  options: {timeout: 10000, response: {response: {neverError: true, responseFormat: 'json'}}}
}, {onError: 'continueRegularOutput', retryOnFail: false});

code('normalize-lever', 'Normalize Lever postings', 1380, -180, `
  const crypto = require('crypto');
  function hashString(str) { return crypto.createHash('sha256').update(String(str || '')).digest('hex'); }
  const detectRiskSignals = ${detectRiskSignals.toString()};
  const classifySeniority = ${classifySeniority.toString()};
  const helper = ${normalizeLeverItem.toString()};
  const source = $('Check claimed source').first().json;
  const items = $input.all().map(i => i.json);
  const list = Array.isArray(items[0]) ? items[0] : items;
  const isIntern = (item) => classifySeniority(item?.text || '', item?.categories?.commitment || '') === 'intern';
  const sorted = [...list].sort((a, b) => (isIntern(b) ? 1 : 0) - (isIntern(a) ? 1 : 0));
  const offset = Number(source.cursor_state?.offset || 0);
  const bounded = sorted.slice(offset, offset + 10);
  return bounded.map(item => ({
    json: {
      run_id: source.run_id,
      lease_token: source.lease_token,
      item: helper(source.config?.company || 'cred', item)
    }
  }));
`);

// 5. Devpost Path
add('fetch-devpost', 'Fetch Devpost hackathons', 'httpRequest', 4.2, 1140, -60, {
  method: 'GET',
  url: 'https://devpost.com/api/hackathons',
  options: {timeout: 10000, response: {response: {neverError: true, responseFormat: 'json'}}}
}, {onError: 'continueRegularOutput', retryOnFail: false});

code('normalize-devpost', 'Normalize Devpost hackathons', 1380, -60, `
  const crypto = require('crypto');
  function hashString(str) { return crypto.createHash('sha256').update(String(str || '')).digest('hex'); }
  const detectRiskSignals = ${detectRiskSignals.toString()};
  const parseDevpostDeadline = ${parseDevpostDeadline.toString()};
  const helper = ${normalizeDevpostItem.toString()};
  const source = $('Check claimed source').first().json;
  const raw = $input.first().json;
  const list = Array.isArray(raw?.hackathons) ? raw.hackathons : [];
  const offset = Number(source.cursor_state?.offset || 0);
  const bounded = list.slice(offset, offset + 10);
  return bounded.map(item => ({
    json: {
      run_id: source.run_id,
      lease_token: source.lease_token,
      item: helper(item)
    }
  }));
`);

// 6. Greenhouse Path
add('fetch-greenhouse', 'Fetch Greenhouse company postings', 'httpRequest', 4.2, 1140, 60, {
  method: 'GET',
  url: '={{ "https://boards-api.greenhouse.io/v1/boards/" + ($json.config.company || "cloudflare") + "/jobs?content=true" }}',
  options: {timeout: 10000, response: {response: {neverError: true, responseFormat: 'json'}}}
}, {onError: 'continueRegularOutput', retryOnFail: false});

code('normalize-greenhouse', 'Normalize Greenhouse postings', 1380, 60, `
  const crypto = require('crypto');
  function hashString(str) { return crypto.createHash('sha256').update(String(str || '')).digest('hex'); }
  const detectRiskSignals = ${detectRiskSignals.toString()};
  const classifySeniority = ${classifySeniority.toString()};
  const helper = ${normalizeGreenhouseItem.toString()};
  const source = $('Check claimed source').first().json;
  const raw = $input.first().json;
  const list = Array.isArray(raw?.jobs) ? raw.jobs : [];
  const isIntern = (item) => classifySeniority(item?.title || '') === 'intern';
  const sorted = [...list].sort((a, b) => (isIntern(b) ? 1 : 0) - (isIntern(a) ? 1 : 0));
  const offset = Number(source.cursor_state?.offset || 0);
  const bounded = sorted.slice(offset, offset + 10);
  return bounded.map(item => ({
    json: {
      run_id: source.run_id,
      lease_token: source.lease_token,
      item: helper(source.config?.company || 'cloudflare', item)
    }
  }));
`);

// 8. Ashby Path
add('fetch-ashby', 'Fetch Ashby company postings', 'httpRequest', 4.2, 1140, 180, {
  method: 'GET',
  url: '={{ "https://api.ashbyhq.com/posting-api/job-board/" + ($json.config.company || "posthog") }}',
  options: {timeout: 10000, response: {response: {neverError: true, responseFormat: 'json'}}}
}, {onError: 'continueRegularOutput', retryOnFail: false});

code('normalize-ashby', 'Normalize Ashby postings', 1380, 180, `
  const crypto = require('crypto');
  function hashString(str) { return crypto.createHash('sha256').update(String(str || '')).digest('hex'); }
  const detectRiskSignals = ${detectRiskSignals.toString()};
  const classifySeniority = ${classifySeniority.toString()};
  const helper = ${normalizeAshbyItem.toString()};
  const source = $('Check claimed source').first().json;
  const raw = $input.first().json;
  const list = Array.isArray(raw?.jobs) ? raw.jobs : [];
  const isIntern = (item) => classifySeniority(item?.title || '') === 'intern';
  const sorted = [...list].sort((a, b) => (isIntern(b) ? 1 : 0) - (isIntern(a) ? 1 : 0));
  const offset = Number(source.cursor_state?.offset || 0);
  const bounded = sorted.slice(offset, offset + 10);
  return bounded.map(item => ({
    json: {
      run_id: source.run_id,
      lease_token: source.lease_token,
      item: helper(source.config?.company || 'posthog', item)
    }
  }));
`);

// 9. JSearch Path
const rapidApiKey = (runtime && config.RAPIDAPI_KEY) ? config.RAPIDAPI_KEY : '={{ $env.RAPIDAPI_KEY }}';
add('fetch-jsearch', 'Fetch JSearch India Internships', 'httpRequest', 4.2, 1140, 300, {
  method: 'GET',
  url: '={{ "https://jsearch.p.rapidapi.com/search-v2?query=" + encodeURIComponent(($json.config.queries && $json.config.queries[0]) || "software engineering intern India") + "&num_pages=1" }}',
  sendHeaders: true,
  headerParameters: {
    parameters: [
      { name: 'x-rapidapi-key', value: rapidApiKey },
      { name: 'x-rapidapi-host', value: 'jsearch.p.rapidapi.com' }
    ]
  },
  options: {timeout: 15000, response: {response: {neverError: true, responseFormat: 'json'}}}
}, {onError: 'continueRegularOutput', retryOnFail: false});

code('normalize-jsearch', 'Normalize JSearch internships', 1380, 300, `
  const crypto = require('crypto');
  function hashString(str) { return crypto.createHash('sha256').update(String(str || '')).digest('hex'); }
  const detectRiskSignals = ${detectRiskSignals.toString()};
  const helper = ${normalizeJSearchItem.toString()};
  const source = $('Check claimed source').first().json;
  const raw = $input.first().json;
  const list = Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw?.data?.jobs) ? raw.data.jobs : []);
  const offset = Number(source.cursor_state?.offset || 0);
  const bounded = list.slice(offset, offset + 10);
  return bounded.map(item => ({
    json: {
      run_id: source.run_id,
      lease_token: source.lease_token,
      item: helper(item)
    }
  }));
`);

// 10. Save Item to Catalog & Inboxes
pg('save-item', 'Save catalog item and project', 1640, 0,
  'select public.worker_save_discovery_item($1::uuid, $2::jsonb, $3::uuid) as result;',
  '={{ [$json.run_id, JSON.stringify($json.item), $json.lease_token] }}'
);

// 11. Aggregate before completing run (ensures finish runs exactly once per batch)
code('aggregate-saved', 'Aggregate saved results', 1840, 0, `
  const items = $input.all();
  const source = $('Check claimed source').first().json;
  const currentOffset = Number(source.cursor_state?.offset || 0);
  const nextOffset = currentOffset + items.length;
  return [{
    json: {
      run_id: source.run_id,
      lease_token: source.lease_token,
      count: items.length,
      next_cursor: JSON.stringify({ offset: nextOffset })
    }
  }];
`);

// 12. Complete Run
pg('finish', 'Complete discovery run', 2040, 0,
  "select public.worker_finish_discovery_run($1::uuid, 'ok', $2::int, $2::int, 0, null, $3::uuid, $4::jsonb) as finished;",
  "={{ [$json.run_id, $json.count, $json.lease_token, $json.next_cursor] }}"
);

// 13. Trigger evaluation for new items
child('trigger-eval', 'Trigger evaluation pipeline', 2240, 0, 'opportunityosSlice3Evaluate');

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

link('Route by adapter', 'Fetch Greenhouse company postings', 2);
link('Fetch Greenhouse company postings', 'Normalize Greenhouse postings');
link('Normalize Greenhouse postings', 'Save catalog item and project');

link('Route by adapter', 'Fetch Ashby company postings', 3);
link('Fetch Ashby company postings', 'Normalize Ashby postings');
link('Normalize Ashby postings', 'Save catalog item and project');

link('Route by adapter', 'Fetch JSearch India Internships', 4);
link('Fetch JSearch India Internships', 'Normalize JSearch internships');
link('Normalize JSearch internships', 'Save catalog item and project');

link('Save catalog item and project', 'Aggregate saved results');
link('Aggregate saved results', 'Complete discovery run');
link('Complete discovery run', 'Trigger evaluation pipeline');


add('note', 'Autonomous Discovery Pipeline', 'stickyNote', 1, 600, -380, {
  content: '## Scheduled & On-Demand Discovery\\nFetches from official zero-auth company feeds (Lever, Greenhouse, Ashby) and hackathons (Devpost). Bounded to 10 items per dispatch. Structured fields mapped in code with zero LLM tokens. Preserves tiered trust: corroborated (company feeds) vs attributed (Devpost) vs unverified (fee/credential risk signals). Drops non-internship/job/hackathon items. Projects to matching profiles and triggers evaluation.',
  width: 900,
  height: 200
});

save('08-discovery.json');
