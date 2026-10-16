// Live End-to-End Audit Script for Slice S4
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const { createServerClient, createChunks } = require('@supabase/ssr');

const envConfig = Object.fromEntries(
  fs.readFileSync('web/.env.local', 'utf8')
    .split(/\r?\n/)
    .filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);

const account = JSON.parse(fs.readFileSync('.local/repair-live-account.json', 'utf8'));
const savedSession = JSON.parse(fs.readFileSync('.local/repair-live-session.json', 'utf8'));

// 1. Establish real authenticated cookie jar for Next.js website
const jar = new Map();
const supabase = createServerClient(envConfig.NEXT_PUBLIC_SUPABASE_URL, envConfig.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
  cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: values => values.forEach(({ name, value }) => value ? jar.set(name, value) : jar.delete(name))
  }
});

const { data: sessionData, error: sessionErr } = await supabase.auth.setSession({
  access_token: savedSession.access_token,
  refresh_token: savedSession.refresh_token
});

if (sessionErr || !sessionData.session) {
  throw new Error('Could not establish live authenticated session: ' + (sessionErr?.message || 'unknown error'));
}

const key = 'sb-' + new URL(envConfig.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0] + '-auth-token';
jar.clear();
for (const chunk of createChunks(key, 'base64-' + Buffer.from(JSON.stringify(sessionData.session)).toString('base64url'))) {
  jar.set(chunk.name, chunk.value);
}

const cookieHeader = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
const appOrigin = envConfig.APP_ORIGIN || 'http://localhost:3000';

console.log('=== STARTING SLICE S4 LIVE END-TO-END AUDIT ===');
console.log('Authenticated User ID:', sessionData.user.id);
console.log('App Origin:', appOrigin);

const auditResults = {
  timestamp: new Date().toISOString(),
  userId: sessionData.user.id,
  steps: []
};

// --- JOURNEY 1: Authenticated Capture Flow ---
console.log('\n--- Journey 1: Authenticated Capture Flow ---');

const captureRequestId = randomUUID();
const captureContent = 'Distributed Systems Engineering Intern at CockroachDB.\nLocation: Bengaluru, India\nWork on distributed SQL execution and Raft consensus engines.\nApply: https://www.cockroachlabs.com/careers/intern-dist-sys';
const capturePayloadHash = createHash('sha256').update(captureContent).digest('hex');

// Step 1.1: Request capture nonce via POST /api/capture/nonce
console.log('1.1: Requesting nonce from POST /api/capture/nonce...');
const nonceRes = await fetch(`${appOrigin}/api/capture/nonce`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Origin': appOrigin,
    'Cookie': cookieHeader
  },
  body: JSON.stringify({
    request_id: captureRequestId,
    payload_hash: capturePayloadHash
  })
});

const nonceStatus = nonceRes.status;
const nonceData = await nonceRes.json();
console.log(`     Response HTTP ${nonceStatus}:`, nonceData);
assert.equal(nonceStatus, 200, 'Nonce request must return 200');
assert.ok(nonceData.nonce, 'Response must include nonce');

auditResults.steps.push({
  step: 'capture_nonce_issuance',
  status: 'PASS',
  http: nonceStatus,
  requestId: captureRequestId,
  nonce: nonceData.nonce
});

// Step 1.2: Submit intake via POST /api/intake with source_type: 'capture'
console.log('1.2: Submitting capture intake via POST /api/intake...');
const intakePayload = {
  source_type: 'capture',
  request_id: captureRequestId,
  content: captureContent,
  nonce: nonceData.nonce,
  payload_hash: capturePayloadHash,
  metadata: {
    title: 'Distributed Systems Engineering Intern',
    url: 'https://www.cockroachlabs.com/careers/intern-dist-sys',
    candidate_url: 'https://www.cockroachlabs.com/careers/intern-dist-sys',
    portal: 'web',
    capture_timestamp: new Date().toISOString()
  }
};

const intakeRes = await fetch(`${appOrigin}/api/intake`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Origin': appOrigin,
    'Cookie': cookieHeader
  },
  body: JSON.stringify(intakePayload)
});

const intakeStatus = intakeRes.status;
const intakeData = await intakeRes.json();
console.log(`     Response HTTP ${intakeStatus}:`, intakeData);
assert.equal(intakeStatus, 201, 'Intake must return 201 Created');
assert.ok(intakeData.id, 'Intake response must include raw_item_id');
assert.equal(intakeData.status, 'queued', 'Initial processing status must be queued');

auditResults.steps.push({
  step: 'capture_intake_submission',
  status: 'PASS',
  http: intakeStatus,
  rawItemId: intakeData.id,
  processingStatus: intakeData.status
});

// Step 1.3: Verify safe idempotent retry with same request_id
console.log('1.3: Verifying safe retry with same request_id...');
const retryRes = await fetch(`${appOrigin}/api/intake`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Origin': appOrigin,
    'Cookie': cookieHeader
  },
  body: JSON.stringify(intakePayload)
});
const retryStatus = retryRes.status;
const retryData = await retryRes.json();
console.log(`     Retry Response HTTP ${retryStatus}:`, retryData);
assert.equal(retryStatus, 201, 'Retry must return 201 with existing item');
assert.equal(retryData.id, intakeData.id, 'Retry must return identical raw_item_id');

auditResults.steps.push({
  step: 'capture_safe_retry',
  status: 'PASS',
  http: retryStatus,
  returnedSameId: retryData.id === intakeData.id
});

// Step 1.4: Verify Inbox Display on Website GET /inbox
console.log('1.4: Verifying Inbox HTML display on GET /inbox...');
const inboxRes = await fetch(`${appOrigin}/inbox`, {
  headers: {
    'Cookie': cookieHeader
  }
});
const inboxHtml = await inboxRes.text();
assert.equal(inboxRes.status, 200, 'Inbox page must load with 200');
assert.ok(inboxHtml.includes('Captured page — unverified source'), 'Inbox must display "Captured page — unverified source"');
assert.ok(inboxHtml.includes('Distributed Systems Engineering Intern'), 'Inbox must display captured opportunity title');

const isAwaitingAnalysis = inboxHtml.includes('Captured page — awaiting analysis');
const isQuotaLimited = inboxHtml.includes('The free AI allowance is currently unavailable');

assert.ok(isAwaitingAnalysis || isQuotaLimited, 'Inbox must honestly display either awaiting analysis (queued) or quota limit notification');

console.log('     Verified inbox contains exact honest labels:');
console.log('     ✓ "Captured page — unverified source"');
console.log('     ✓ "Distributed Systems Engineering Intern"');
if (isQuotaLimited) {
  console.log('     ✓ "The free AI allowance is currently unavailable. Your submission is preserved; retry after the allowance resets." (Gate 15: AI quota exhausted after intake)');
} else {
  console.log('     ✓ "Captured page — awaiting analysis"');
}

auditResults.steps.push({
  step: 'inbox_ui_verification',
  status: 'PASS',
  foundUnverifiedSourceLabel: true,
  foundQuotaLimitedOrAwaitingLabel: true
});

// --- JOURNEY 2: Sources Page & Portal Truthful States ---
console.log('\n--- Journey 2: Sources Page & Honest Portal Verification ---');
const sourcesRes = await fetch(`${appOrigin}/sources`, {
  headers: {
    'Cookie': cookieHeader
  }
});
const sourcesHtml = await sourcesRes.text();
assert.equal(sourcesRes.status, 200, 'Sources page must load with 200');
assert.ok(sourcesHtml.includes('Guided Alert-Email Forwarding'), 'Sources page must have Guided Alert-Email Forwarding section');
assert.ok(sourcesHtml.includes('Save to OpportunityOS'), 'Sources page must have Save to OpportunityOS Bookmarklet section');
assert.ok(sourcesHtml.includes('Your Personal Forwarding Address'), 'Sources page must display personal forwarding address');

console.log('     ✓ Sources page renders "Guided Alert-Email Forwarding"');
console.log('     ✓ Sources page renders "Save to OpportunityOS" Bookmarklet');
console.log('     ✓ Sources page displays unique student forwarding address');

auditResults.steps.push({
  step: 'sources_ui_verification',
  status: 'PASS'
});

// --- JOURNEY 3: Security & Negative Gates ---
console.log('\n--- Journey 3: Security & Negative Gates ---');

// 3.1: Anonymous Nonce Request -> 401
console.log('3.1: Anonymous nonce request...');
const anonRes = await fetch(`${appOrigin}/api/capture/nonce`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Origin': appOrigin },
  body: JSON.stringify({ request_id: randomUUID(), payload_hash: capturePayloadHash })
});
assert.equal(anonRes.status, 401, 'Anonymous request must return 401');
console.log(`     HTTP ${anonRes.status}: Correctly denied anonymous caller`);

// 3.2: Cross-Origin Request -> 403
console.log('3.2: Cross-origin nonce request...');
const crossOriginRes = await fetch(`${appOrigin}/api/capture/nonce`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Origin': 'http://malicious-site.com', 'Cookie': cookieHeader },
  body: JSON.stringify({ request_id: randomUUID(), payload_hash: capturePayloadHash })
});
assert.equal(crossOriginRes.status, 403, 'Cross-origin request must return 403');
console.log(`     HTTP ${crossOriginRes.status}: Correctly denied cross-origin caller`);

// 3.3: Tampered Payload Digest -> 400
console.log('3.3: Tampered payload digest...');
const newReqId = randomUUID();
const freshNonceRes = await fetch(`${appOrigin}/api/capture/nonce`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Origin': appOrigin, 'Cookie': cookieHeader },
  body: JSON.stringify({ request_id: newReqId, payload_hash: capturePayloadHash })
});
const freshNonceData = await freshNonceRes.json();
const tamperedRes = await fetch(`${appOrigin}/api/intake`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Origin': appOrigin, 'Cookie': cookieHeader },
  body: JSON.stringify({
    source_type: 'capture',
    request_id: newReqId,
    content: captureContent + ' [TAMPERED_INJECTION]',
    nonce: freshNonceData.nonce,
    payload_hash: capturePayloadHash
  })
});
assert.equal(tamperedRes.status, 400, 'Tampered payload must return 400');
const tamperedData = await tamperedRes.json();
console.log(`     HTTP ${tamperedRes.status}: Correctly caught digest mismatch:`, tamperedData.error);

// 3.4: Reused Nonce -> 403
console.log('3.4: Reused nonce redemption attempt...');
const reusedNonceRes = await fetch(`${appOrigin}/api/intake`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Origin': appOrigin, 'Cookie': cookieHeader },
  body: JSON.stringify({
    source_type: 'capture',
    request_id: randomUUID(), // different request_id using consumed nonce
    content: captureContent,
    nonce: nonceData.nonce,
    payload_hash: capturePayloadHash
  })
});
assert.equal(reusedNonceRes.status, 403, 'Reused nonce must return 403');
const reusedData = await reusedNonceRes.json();
console.log(`     HTTP ${reusedNonceRes.status}: Correctly denied reused nonce:`, reusedData.error);

auditResults.steps.push({
  step: 'security_negative_gates',
  status: 'PASS',
  anonymousBlocked: true,
  crossOriginBlocked: true,
  tamperingBlocked: true,
  nonceReuseBlocked: true
});

fs.writeFileSync('.local/audit-s4-live-evidence.json', JSON.stringify(auditResults, null, 2));
console.log('\n=== ALL SLICE S4 LIVE JOURNEYS AND GATES PASSED SUCCESSFULLY ===');
