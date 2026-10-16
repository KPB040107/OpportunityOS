import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  cleanTrackingUrl,
  detectPortal,
  deterministicUUID,
  validateCapturePayload,
  parseMultiListingAlert
} from './capture-contract.mjs';

test('Gate S4: cleanTrackingUrl cleanly strips marketing & tracking parameters while preserving functional params', () => {
  const dirtyLinkedIn = 'https://www.linkedin.com/jobs/view/9988776655?utm_source=share&utm_medium=member_desktop&utm_campaign=job_alert&trk=public_jobs_job-result-card_result-card_full-click&trackingId=xyz789#apply';
  const cleanLinkedIn = cleanTrackingUrl(dirtyLinkedIn);
  assert.equal(cleanLinkedIn, 'https://www.linkedin.com/jobs/view/9988776655');

  const dirtyInternshala = 'https://internshala.com/internship/detail/fullstack-intern?id=12345&utm_campaign=digest&ref=search';
  const cleanInternshala = cleanTrackingUrl(dirtyInternshala);
  assert.equal(cleanInternshala, 'https://internshala.com/internship/detail/fullstack-intern?id=12345');

  const dirtyUnstop = 'https://unstop.com/hackathons/flipkart-grid-60?ref_id=1122&fbclid=abc_xyz';
  assert.equal(cleanTrackingUrl(dirtyUnstop), 'https://unstop.com/hackathons/flipkart-grid-60');

  // Unwraps target destination from tracking redirect links
  const redirectUrl = 'https://mandrillapp.com/track/click?url=https%3A%2F%2Fwww.linkedin.com%2Fjobs%2Fview%2F5544332211%3Futm_source%3Dmail';
  assert.equal(cleanTrackingUrl(redirectUrl), 'https://www.linkedin.com/jobs/view/5544332211');

  // Rejects opaque redirector hosts with no identifiable destination
  const opaqueRedirect = 'https://clk.linkedin.com/track/deadend';
  assert.equal(cleanTrackingUrl(opaqueRedirect), '');
});

test('Gate S4: detectPortal accurately tags platform from URL or content', () => {
  assert.equal(detectPortal('https://www.linkedin.com/jobs/view/123'), 'linkedin');
  assert.equal(detectPortal('https://unstop.com/competitions/code-sprint'), 'unstop');
  assert.equal(detectPortal('https://internshala.com/internship/detail/react-intern'), 'internshala');
  assert.equal(detectPortal('https://jobs.lever.co/cred/1234'), 'web');
});

test('Gate S4: deterministicUUID produces valid RFC UUID format deterministically', () => {
  const seedA = 'parent-1234:listing:0';
  const uuid1 = deterministicUUID(seedA);
  const uuid2 = deterministicUUID(seedA);
  assert.equal(uuid1, uuid2);
  assert.match(uuid1, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

  const uuidDifferent = deterministicUUID('parent-1234:listing:1');
  assert.notEqual(uuid1, uuidDifferent);
});

test('Gate S4: validateCapturePayload enforces character limits and neutralizes XSS & credential leaks', () => {
  const valid = {
    title: 'Backend Intern at CRED',
    url: 'https://jobs.lever.co/cred/1234?utm_source=email',
    text: 'Building high-throughput payment systems with Go and PostgreSQL.',
    links: [{ text: 'Apply', url: 'https://jobs.lever.co/cred/1234/apply?trk=123' }]
  };

  const validated = validateCapturePayload(valid);
  assert.equal(validated.title, 'Backend Intern at CRED');
  assert.equal(validated.url, 'https://jobs.lever.co/cred/1234');
  assert.equal(validated.links[0].url, 'https://jobs.lever.co/cred/1234/apply');
  assert.ok(validated.content_hash);

  // Reject oversized text (> 20,000 characters)
  assert.throws(() => {
    validateCapturePayload({
      title: 'Oversized',
      url: 'https://example.com/job',
      text: 'x'.repeat(20001)
    });
  }, /PAYLOAD_TOO_LARGE/);

  // Reject malicious script injection or credential harvesting
  assert.throws(() => {
    validateCapturePayload({
      title: 'XSS attempt',
      url: 'https://example.com/job',
      text: 'Check this out <script>document.cookie="stolen"</script>'
    });
  }, /SECURITY_VIOLATION/);

  assert.throws(() => {
    validateCapturePayload({
      title: 'Token leak',
      url: 'https://example.com/job',
      text: 'Authorization: Bearer my-secret-jwt-token'
    });
  }, /SECURITY_VIOLATION/);
});

test('Gate S4: Multi-listing alert email splits into discrete candidates with strict boundary isolation', () => {
  const linkedInEmail = `
Job Alert: 2 new jobs for Software Engineer Intern:

Role: Cloud Platform Intern at AWS
Bengaluru, KA
https://www.linkedin.com/jobs/view/2001?trk=email-alert&utm_source=linkedin

Role: Fullstack Intern at Razorpay
Bengaluru, KA
https://www.linkedin.com/jobs/view/2002?trk=email-alert&trackingId=88
  `;

  const parentRequestId = '4a1b2c3d-0000-5000-a000-000000000001';
  const candidates = parseMultiListingAlert(linkedInEmail, 'jobalerts-noreply@linkedin.com', parentRequestId);

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].portal, 'linkedin');
  assert.equal(candidates[0].type, 'internship');
  assert.equal(candidates[0].application_url, 'https://www.linkedin.com/jobs/view/2001');
  assert.equal(candidates[1].application_url, 'https://www.linkedin.com/jobs/view/2002');
  assert.ok(candidates[0].title.includes('Cloud Platform Intern'));
  assert.ok(candidates[1].title.includes('Fullstack Intern'));

  // Strict boundary isolation: Candidate 0 text does not contaminate candidate 1
  assert.ok(!candidates[0].text.includes('Fullstack Intern'));
  assert.ok(!candidates[0].text.includes('2002'));
  assert.ok(!candidates[1].text.includes('Cloud Platform Intern'));
  assert.ok(!candidates[1].text.includes('2001'));

  // Deterministic candidate Request IDs
  assert.notEqual(candidates[0].request_id, candidates[1].request_id);
  assert.match(candidates[0].request_id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test('Gate S4: Digest bomb protection caps candidates at 10 listings per alert', () => {
  let bombEmail = 'Your Daily Job Digest:\n\n';
  for (let i = 1; i <= 20; i++) {
    bombEmail += `Role: Software Intern ${i} at Company ${i}\nBengaluru, KA\nhttps://www.linkedin.com/jobs/view/8000${i}\n\n`;
  }

  const results = parseMultiListingAlert(bombEmail, 'jobalerts-noreply@linkedin.com', 'parent-bomb-req');
  assert.equal(results.length, 10);
  assert.equal(results[0].title, 'Software Intern 1 at Company 1');
  assert.equal(results[9].title, 'Software Intern 10 at Company 10');
});

test('Gate S4: Shallow alerts keep unstated facts missing without scraping login-gated pages', () => {
  const shallowInternshalaAlert = `
Internshala Internship Alert:
Web Development Internship at TechCorp
https://internshala.com/internship/detail/techcorp-web-intern
Stipend: 20000/month
  `;

  const results = parseMultiListingAlert(shallowInternshalaAlert, 'alerts@internshala.com', 'parent-single-req');
  assert.equal(results.length, 1);
  assert.equal(results[0].portal, 'internshala');
  assert.equal(results[0].type, 'internship');
  assert.equal(results[0].request_id, 'parent-single-req');
  // Does not invent CGPA, graduation year, or requirements that the shallow email didn't state
  assert.equal(results[0].requirements, undefined);
  assert.equal(results[0].deadline, undefined);
});

test('Gate S4: Bookmarklet nonce lifecycle contract - bound to requestId and payloadHash, with replay prevention and safe retry', () => {
  const nonces = new Map();
  const rawItems = new Set(); // Simulates database raw_items

  function issueNonce(userId, requestId, payloadHash) {
    const nonce = crypto.randomUUID();
    nonces.set(nonce, {
      userId,
      requestId,
      payloadHash,
      used: false,
      expiresAt: Date.now() + 60000
    });
    return nonce;
  }

  function redeemNonce(nonce, userId, requestId, payloadHash) {
    const record = nonces.get(nonce);
    if (!record) {
      return { valid: false, error: 'NONCE_NOT_FOUND' };
    }
    if (record.userId !== userId) {
      return { valid: false, error: 'UNAUTHORIZED' };
    }
    if (record.expiresAt <= Date.now()) {
      return { valid: false, error: 'NONCE_EXPIRED' };
    }
    if (record.requestId !== requestId) {
      return { valid: false, error: 'REQUEST_ID_MISMATCH' };
    }
    if (record.payloadHash !== payloadHash) {
      return { valid: false, error: 'PAYLOAD_HASH_MISMATCH' };
    }
    if (record.used) {
      // Safe retry check: if raw_items already has this item for this user, allow retry
      if (rawItems.has(`${userId}:${requestId}`)) {
        return { valid: true, is_retry: true };
      }
      return { valid: false, error: 'NONCE_ALREADY_USED' };
    }
    record.used = true;
    return { valid: true };
  }

  const userA = 'user-uuid-1111';
  const userB = 'user-uuid-2222';
  const reqId = crypto.randomUUID();
  const hash1 = createHash('sha256').update('Original payload content').digest('hex');
  const hashTampered = createHash('sha256').update('Tampered payload content').digest('hex');

  const nonce = issueNonce(userA, reqId, hash1);

  // 1. Cross-user redemption fails
  assert.equal(redeemNonce(nonce, userB, reqId, hash1).valid, false);

  // 2. Tampered payload digest fails
  const tamperedResult = redeemNonce(nonce, userA, reqId, hashTampered);
  assert.equal(tamperedResult.valid, false);
  assert.equal(tamperedResult.error, 'PAYLOAD_HASH_MISMATCH');

  // 3. Mismatched request_id fails
  const mismatchedReqResult = redeemNonce(nonce, userA, crypto.randomUUID(), hash1);
  assert.equal(mismatchedReqResult.valid, false);
  assert.equal(mismatchedReqResult.error, 'REQUEST_ID_MISMATCH');

  // 4. Valid redemption succeeds
  const validResult = redeemNonce(nonce, userA, reqId, hash1);
  assert.equal(validResult.valid, true);

  // 5. Replay attempt without raw_items saved fails
  const replayResult = redeemNonce(nonce, userA, reqId, hash1);
  assert.equal(replayResult.valid, false);
  assert.equal(replayResult.error, 'NONCE_ALREADY_USED');

  // 6. Idempotent retry when first save succeeded but response was lost
  rawItems.add(`${userA}:${reqId}`);
  const retryResult = redeemNonce(nonce, userA, reqId, hash1);
  assert.equal(retryResult.valid, true);
  assert.equal(retryResult.is_retry, true);

  // 7. Expired nonce fails
  const expiredNonce = crypto.randomUUID();
  nonces.set(expiredNonce, {
    userId: userA,
    requestId: reqId,
    payloadHash: hash1,
    used: false,
    expiresAt: Date.now() - 1000
  });
  const expiredResult = redeemNonce(expiredNonce, userA, reqId, hash1);
  assert.equal(expiredResult.valid, false);
  assert.equal(expiredResult.error, 'NONCE_EXPIRED');
});

test('Gate S4: Exported n8n 01-ingest workflow contains forward-split node executing shared parsing contract', () => {
  const workflow = JSON.parse(readFileSync('workflows/01-ingest.json', 'utf8'));

  const splitNode = workflow.nodes.find(n => n.id === 'forward-split');
  assert.ok(splitNode, 'forward-split node must exist in 01-ingest.json');

  // Verify connection from forward-parse -> forward-split -> forward-save
  const connections = workflow.connections;
  assert.ok(
    connections['Validate the personal forwarding alias before AI'].main[0].some(c => c.node === 'Parse alert candidates into discrete items'),
    'forward-parse must connect to forward-split'
  );
  assert.ok(
    connections['Parse alert candidates into discrete items'].main[0].some(c => c.node === 'Resolve alias ownership and save forwarded text'),
    'forward-split must connect to forward-save'
  );

  // Execute the exact embedded jsCode from forward-split node
  const jsCode = splitNode.parameters.jsCode;
  const runSplit = new Function('$input', jsCode);

  const testInput = {
    all: () => [
      {
        json: {
          alias: 'a'.repeat(32),
          request_id: '55555555-5555-4555-8555-555555555555',
          text: `
Job Alert: 2 new jobs matching Software Engineer:
Role: Backend Intern at Uber
Bengaluru, KA
https://www.linkedin.com/jobs/view/3001

Role: Frontend Intern at CRED
Bengaluru, KA
https://www.linkedin.com/jobs/view/3002
          `,
          from_address: 'jobalerts-noreply@linkedin.com',
          subject: 'Job Alert: Software Engineer',
          message_id: 'msg-id-123'
        }
      }
    ]
  };

  const output = runSplit(testInput);
  assert.equal(output.length, 2);
  assert.equal(output[0].json.alias, 'a'.repeat(32));
  assert.equal(output[0].json.metadata.candidate_url, 'https://www.linkedin.com/jobs/view/3001');
  assert.equal(output[1].json.metadata.candidate_url, 'https://www.linkedin.com/jobs/view/3002');
  assert.equal(output[0].json.metadata.parent_request_id, '55555555-5555-4555-8555-555555555555');
  assert.notEqual(output[0].json.request_id, output[1].json.request_id);
});
