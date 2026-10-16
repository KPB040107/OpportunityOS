import {readFileSync} from 'node:fs';
import {prepareDiscoveryBatch, summarizeDiscoveryBatch} from './discovery-batch.mjs';
import {workflowBuilder} from './workflow-builder.mjs';
import {normalizeLeverItem, normalizeDevpostItem, normalizeGreenhouseItem, normalizeAshbyItem, normalizeJSearchItem, detectRiskSignals, parseDevpostDeadline, classifySeniority, htmlToCleanText, isIndiaOrRemoteLocation} from './discovery-adapters.mjs';

const b = workflowBuilder('opportunityosSlice2Discovery', 'OpportunityOS 08 Discovery');
const {runtime, config, add, pg, code, branch, link, child, save} = b;

const skillHelpers = readFileSync(new URL('./skill-extractor.mjs', import.meta.url), 'utf8').replaceAll('export function ', 'function ');

// 1. Triggers
add('schedule', 'Scan active discovery sources', 'scheduleTrigger', 1.2, 0, 0, {
  rule: {interval: [{field: 'minutes', minutesInterval: 15}]}
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
  options: {timeout: 10000, response: {response: {neverError: true, responseFormat: 'json', fullResponse: true}}}
}, {onError: 'continueRegularOutput', retryOnFail: false});

code('normalize-lever', 'Normalize Lever postings', 1380, -180, `
  const crypto = require('crypto');
  function hashString(str) { return crypto.createHash('sha256').update(String(str || '')).digest('hex'); }
  ${skillHelpers}
  const htmlToCleanText = ${htmlToCleanText.toString()};
  const isIndiaOrRemoteLocation = ${isIndiaOrRemoteLocation.toString()};
  const detectRiskSignals = ${detectRiskSignals.toString()};
  const classifySeniority = ${classifySeniority.toString()};
  const parseDevpostDeadline = ${parseDevpostDeadline.toString()};
  const helper = ${normalizeLeverItem.toString()};
  const prepare = ${prepareDiscoveryBatch.toString()};
  const source = $('Check claimed source').first().json;
  return prepare(source, $input.first().json, item => helper(source.config.company, item), 'array');
`);
// 5. Devpost Path
add('fetch-devpost', 'Fetch Devpost hackathons', 'httpRequest', 4.2, 1140, -60, {
  method: 'GET',
  url: 'https://devpost.com/api/hackathons',
  options: {timeout: 10000, response: {response: {neverError: true, responseFormat: 'json', fullResponse: true}}}
}, {onError: 'continueRegularOutput', retryOnFail: false});

code('normalize-devpost', 'Normalize Devpost hackathons', 1380, -60, `
  const crypto = require('crypto');
  function hashString(str) { return crypto.createHash('sha256').update(String(str || '')).digest('hex'); }
  ${skillHelpers}
  const htmlToCleanText = ${htmlToCleanText.toString()};
  const isIndiaOrRemoteLocation = ${isIndiaOrRemoteLocation.toString()};
  const detectRiskSignals = ${detectRiskSignals.toString()};
  const classifySeniority = ${classifySeniority.toString()};
  const parseDevpostDeadline = ${parseDevpostDeadline.toString()};
  const helper = ${normalizeDevpostItem.toString()};
  const prepare = ${prepareDiscoveryBatch.toString()};
  const source = $('Check claimed source').first().json;
  return prepare(source, $input.first().json, helper, 'hackathons');
`);
// 6. Greenhouse Path
add('fetch-greenhouse', 'Fetch Greenhouse company postings', 'httpRequest', 4.2, 1140, 60, {
  method: 'GET',
  url: '={{ "https://boards-api.greenhouse.io/v1/boards/" + ($json.config.company || "cloudflare") + "/jobs?content=true" }}',
  options: {timeout: 10000, response: {response: {neverError: true, responseFormat: 'json', fullResponse: true}}}
}, {onError: 'continueRegularOutput', retryOnFail: false});

code('normalize-greenhouse', 'Normalize Greenhouse postings', 1380, 60, `
  const crypto = require('crypto');
  function hashString(str) { return crypto.createHash('sha256').update(String(str || '')).digest('hex'); }
  ${skillHelpers}
  const htmlToCleanText = ${htmlToCleanText.toString()};
  const isIndiaOrRemoteLocation = ${isIndiaOrRemoteLocation.toString()};
  const detectRiskSignals = ${detectRiskSignals.toString()};
  const classifySeniority = ${classifySeniority.toString()};
  const parseDevpostDeadline = ${parseDevpostDeadline.toString()};
  const helper = ${normalizeGreenhouseItem.toString()};
  const prepare = ${prepareDiscoveryBatch.toString()};
  const source = $('Check claimed source').first().json;
  return prepare(source, $input.first().json, item => helper(source.config.company, item), 'jobs');
`);
// 8. Ashby Path
add('fetch-ashby', 'Fetch Ashby company postings', 'httpRequest', 4.2, 1140, 180, {
  method: 'GET',
  url: '={{ "https://api.ashbyhq.com/posting-api/job-board/" + ($json.config.company || "posthog") }}',
  options: {timeout: 10000, response: {response: {neverError: true, responseFormat: 'json', fullResponse: true}}}
}, {onError: 'continueRegularOutput', retryOnFail: false});

code('normalize-ashby', 'Normalize Ashby postings', 1380, 180, `
  const crypto = require('crypto');
  function hashString(str) { return crypto.createHash('sha256').update(String(str || '')).digest('hex'); }
  ${skillHelpers}
  const htmlToCleanText = ${htmlToCleanText.toString()};
  const isIndiaOrRemoteLocation = ${isIndiaOrRemoteLocation.toString()};
  const detectRiskSignals = ${detectRiskSignals.toString()};
  const classifySeniority = ${classifySeniority.toString()};
  const parseDevpostDeadline = ${parseDevpostDeadline.toString()};
  const helper = ${normalizeAshbyItem.toString()};
  const prepare = ${prepareDiscoveryBatch.toString()};
  const source = $('Check claimed source').first().json;
  return prepare(source, $input.first().json, item => helper(source.config.company, item), 'jobs');
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
  options: {timeout: 15000, response: {response: {neverError: true, responseFormat: 'json', fullResponse: true}}}
}, {onError: 'continueRegularOutput', retryOnFail: false});

code('normalize-jsearch', 'Normalize JSearch internships', 1380, 300, `
  const crypto = require('crypto');
  function hashString(str) { return crypto.createHash('sha256').update(String(str || '')).digest('hex'); }
  ${skillHelpers}
  const detectRiskSignals = ${detectRiskSignals.toString()};
  const classifySeniority = ${classifySeniority.toString()};
  const parseDevpostDeadline = ${parseDevpostDeadline.toString()};
  const helper = ${normalizeJSearchItem.toString()};
  const prepare = ${prepareDiscoveryBatch.toString()};
  const source = $('Check claimed source').first().json;
  return prepare(source, $input.first().json, helper, 'data');
`);
// Keep an explicit terminal path for empty feeds and failed fetches.
code('batch', 'Prepared discovery batch', 1520, 0, 'return $input.all();');
branch('has-items', 'Batch contains listings?', 1580, 0, '={{ !!$json.item }}');
pg('save-item', 'Save catalog item and project', 1740, 0,
  'select public.worker_save_discovery_item($1::uuid, $2::jsonb, $3::uuid) as result;',
  '={{ [$json.run_id, JSON.stringify($json.item), $json.lease_token] }}');
code('aggregate-saved', 'Aggregate saved results', 1940, 0, `
 const summarize = ${summarizeDiscoveryBatch.toString()};
 return [{json:summarize($input.all(), $('Prepared discovery batch').all())}];
`);
code('empty-summary', 'Record empty or failed fetch', 1740, 220, `
 const summarize = ${summarizeDiscoveryBatch.toString()};
 return [{json:summarize([], $input.all())}];
`);
pg('finish', 'Complete discovery run', 2140, 0,
 'select public.worker_finish_discovery_run($1::uuid,$2::text,$3::int,$4::int,$5::int,$6::text,$7::uuid,$8::jsonb) as finished;',
 '={{ [$json.run_id,$json.status,$json.found,$json.added,$json.updated,$json.error,$json.lease_token,$json.next_cursor ? JSON.stringify($json.next_cursor) : null] }}');
code('verify-finish', 'Verify completion persisted', 2300, 0, "if (!$input.first().json.finished) throw new Error('DISCOVERY_COMPLETION_REJECTED'); return $input.all();");
child('trigger-eval', 'Trigger evaluation pipeline', 2440, 0, 'opportunityosSlice3Evaluate');

// Wiring
for (const t of ['Scan active discovery sources', 'Manual discovery scan', 'Execute discovery scan']) {
  link(t, 'Claim due source from registry');
}
link('Claim due source from registry', 'Check claimed source');
link('Check claimed source', 'Source was claimed?');
link('Source was claimed?', 'Route by adapter');

link('Route by adapter', 'Fetch Lever company postings', 0);
link('Fetch Lever company postings', 'Normalize Lever postings');
link('Normalize Lever postings', 'Prepared discovery batch');

link('Route by adapter', 'Fetch Devpost hackathons', 1);
link('Fetch Devpost hackathons', 'Normalize Devpost hackathons');
link('Normalize Devpost hackathons', 'Prepared discovery batch');

link('Route by adapter', 'Fetch Greenhouse company postings', 2);
link('Fetch Greenhouse company postings', 'Normalize Greenhouse postings');
link('Normalize Greenhouse postings', 'Prepared discovery batch');

link('Route by adapter', 'Fetch Ashby company postings', 3);
link('Fetch Ashby company postings', 'Normalize Ashby postings');
link('Normalize Ashby postings', 'Prepared discovery batch');

link('Route by adapter', 'Fetch JSearch India Internships', 4);
link('Fetch JSearch India Internships', 'Normalize JSearch internships');
link('Normalize JSearch internships', 'Prepared discovery batch');

link('Prepared discovery batch', 'Batch contains listings?');
link('Batch contains listings?', 'Save catalog item and project');
link('Batch contains listings?', 'Record empty or failed fetch', 1);
link('Record empty or failed fetch', 'Complete discovery run');
link('Save catalog item and project', 'Aggregate saved results');
link('Aggregate saved results', 'Complete discovery run');
link('Complete discovery run', 'Verify completion persisted');
link('Verify completion persisted', 'Trigger evaluation pipeline');


add('note', 'Autonomous Discovery Pipeline', 'stickyNote', 1, 600, -380, {
  content: '## Scheduled & On-Demand Discovery\\nFetches from official zero-auth company feeds (Lever, Greenhouse, Ashby) and hackathons (Devpost). Bounded to 10 items per dispatch. Structured fields mapped in code with zero LLM tokens. Preserves tiered trust: corroborated (company feeds) vs attributed (Devpost) vs unverified (fee/credential risk signals). Drops non-internship/job/hackathon items. Projects to matching profiles and triggers evaluation.',
  width: 900,
  height: 200
});

save('08-discovery.json');
