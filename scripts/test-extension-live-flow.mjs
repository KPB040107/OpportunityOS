// Test Live Flow for Browser Extension Capture (Origin: chrome-extension://...)
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const { createChunks } = require('@supabase/ssr');

const envConfig = Object.fromEntries(
  fs.readFileSync('web/.env.local', 'utf8')
    .split(/\r?\n/)
    .filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);

const savedSession = JSON.parse(fs.readFileSync('.local/repair-live-session.json', 'utf8'));
const key = 'sb-' + new URL(envConfig.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0] + '-auth-token';
const chunks = createChunks(key, 'base64-' + Buffer.from(JSON.stringify(savedSession)).toString('base64url'));
const cookieHeader = chunks.map(c => c.name + '=' + c.value).join('; ');
const appOrigin = envConfig.APP_ORIGIN || 'http://localhost:3000';
const mockExtensionOrigin = 'chrome-extension://opportunityosmockextensionid';

console.log('=== TESTING BROWSER EXTENSION LIVE CAPTURE FLOW ===');

// Step 1: Preflight OPTIONS on /api/capture/nonce
console.log('1. Testing OPTIONS preflight from extension...');
const optionsRes = await fetch(`${appOrigin}/api/capture/nonce`, {
  method: 'OPTIONS',
  headers: {
    origin: mockExtensionOrigin,
    'access-control-request-method': 'POST'
  }
});
assert.equal(optionsRes.status, 204, 'OPTIONS should return 204 No Content');
assert.equal(optionsRes.headers.get('access-control-allow-origin'), mockExtensionOrigin, 'Must allow extension origin');
assert.equal(optionsRes.headers.get('access-control-allow-credentials'), 'true', 'Must allow credentials');
console.log('✓ OPTIONS preflight succeeded with correct CORS headers');

// Step 1b: Verify arbitrary malicious extension is rejected with 403
console.log('1b. Testing rejection of unauthorized extension origin...');
const badExtensionRes = await fetch(`${appOrigin}/api/capture/nonce`, {
  method: 'OPTIONS',
  headers: {
    origin: 'chrome-extension://maliciousunauthorizedextensionid',
    'access-control-request-method': 'POST'
  }
});
assert.equal(badExtensionRes.status, 403, 'Unauthorized extension must be rejected with 403');
console.log('✓ Unauthorized extension correctly blocked with HTTP 403');

// Step 2: Request Nonce from extension origin
console.log('\n2. Testing POST /api/capture/nonce from extension...');
const requestId = randomUUID();
const sampleText = 'Senior React Developer at Fictional Startup Labs. Experience with Next.js, Node.js, and TypeScript required. Apply at https://example.com/careers/react-dev';
const payloadHash = createHash('sha256').update(sampleText).digest('hex');

const nonceRes = await fetch(`${appOrigin}/api/capture/nonce`, {
  method: 'POST',
  headers: {
    origin: mockExtensionOrigin,
    'content-type': 'application/json',
    cookie: cookieHeader
  },
  body: JSON.stringify({
    request_id: requestId,
    payload_hash: payloadHash
  })
});

assert.equal(nonceRes.status, 200, 'Nonce request from extension must return 200');
const nonceData = await nonceRes.json();
assert.ok(nonceData.nonce, 'Response must contain single-use nonce');
assert.equal(nonceRes.headers.get('access-control-allow-origin'), mockExtensionOrigin, 'Response must include CORS header');
console.log('✓ Capture nonce issued successfully:', nonceData.nonce);

// Step 3: Submit to /api/intake from extension origin
console.log('\n3. Testing POST /api/intake from extension...');
const intakeRes = await fetch(`${appOrigin}/api/intake`, {
  method: 'POST',
  headers: {
    origin: mockExtensionOrigin,
    'content-type': 'application/json',
    cookie: cookieHeader
  },
  body: JSON.stringify({
    request_id: requestId,
    source_type: 'capture',
    content: sampleText,
    payload_hash: payloadHash,
    nonce: nonceData.nonce,
    metadata: {
      title: 'Senior React Developer (Extension Captured)',
      organization: 'Fictional Startup Labs',
      url: 'https://example.com/careers/react-dev',
      links: [{ text: 'Apply Link', url: 'https://example.com/careers/react-dev' }],
      portal: 'Web',
      source_type: 'extension',
      captured_at: new Date().toISOString()
    }
  })
});

console.log('Intake response status:', intakeRes.status);
const intakeData = await intakeRes.json();
console.log('Intake response body:', intakeData);
assert.equal(intakeRes.status, 201, 'Intake must accept submission with 201 Created');
assert.ok(intakeData.id, 'Must return raw_item_id');
assert.equal(intakeRes.headers.get('access-control-allow-origin'), mockExtensionOrigin, 'Intake response must include CORS header');
console.log('✓ Opportunity accepted into intake queue with ID:', intakeData.id);

console.log('\n======================================================');
console.log('ALL BROWSER EXTENSION LIVE INTEGRATION CHECKS PASSED!');
console.log('======================================================\n');
