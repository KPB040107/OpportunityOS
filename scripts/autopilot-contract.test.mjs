import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutopilotContract } from './autopilot-contract.mjs';

const autopilot = createAutopilotContract();

test('calculates next run interval accurately', () => {
  const base = new Date('2026-10-12T10:00:00Z');
  const next = autopilot.calculateNextRun(base, 24);
  assert.equal(next, '2026-10-13T10:00:00.000Z');
});

test('categorizes deadline urgency properly', () => {
  assert.equal(autopilot.categorizeDeadlineUrgency(0), 'critical');
  assert.equal(autopilot.categorizeDeadlineUrgency(1), 'critical');
  assert.equal(autopilot.categorizeDeadlineUrgency(2), 'urgent');
  assert.equal(autopilot.categorizeDeadlineUrgency(3), 'urgent');
  assert.equal(autopilot.categorizeDeadlineUrgency(5), 'upcoming');
});

test('formats deadline reminder email with urgency tags', () => {
  const email = autopilot.formatDeadlineReminderEmail({
    userEmail: 'student@example.com',
    deadlines: [
      {
        title: 'Google STEP Internship',
        organization: 'Google',
        deadline: '2026-10-14',
        days_remaining: 1,
        status: 'to_apply',
        application_url: 'https://careers.google.com'
      },
      {
        title: 'Smart India Hackathon',
        organization: 'Ministry of Education',
        deadline: '2026-10-18',
        days_remaining: 5,
        status: 'saved'
      }
    ]
  });

  assert.match(email.subject, /\[OpportunityOS Alert\] 1 Upcoming Deadline/);
  assert.match(email.text, /\[CRITICAL\] Google STEP Internship/);
  assert.match(email.text, /\[UPCOMING\] Smart India Hackathon/);
  assert.match(email.text, /NEVER automatically submit/);
});

test('sanitizes secrets and credentials from error logs', () => {
  const demoJwt = [JSON.stringify({alg:'HS256',typ:'JWT'}),JSON.stringify({sub:'DEMO_TEST_USER',exp:1})].map(value=>Buffer.from(value).toString('base64url')).join('.')+'.FAKE_DEMO_SIGNATURE';
  const rawWithJwt = 'Workflow failed with auth error: '+demoJwt;
  const cleanJwt = autopilot.sanitizeErrorMessage(rawWithJwt);
  assert.ok(!cleanJwt.includes('doNotLeakThisSignature'));
  assert.ok(cleanJwt.includes('[REDACTED_JWT]'));

  const rawWithDb = 'Connection error: postgresql://postgres:SuperSecretPassword123@db.supabase.co:5432/postgres';
  const cleanDb = autopilot.sanitizeErrorMessage(rawWithDb);
  assert.ok(!cleanDb.includes('SuperSecretPassword123'));
  assert.ok(cleanDb.includes('[REDACTED_DB_CREDENTIALS]'));

  const rawWithBearer = 'HTTP 401: Bearer ya29.a0AfH6SMDI83921038102391203';
  const cleanBearer = autopilot.sanitizeErrorMessage(rawWithBearer);
  assert.ok(!cleanBearer.includes('ya29.a0AfH6'));
  assert.ok(cleanBearer.includes('[REDACTED_TOKEN]'));
});
