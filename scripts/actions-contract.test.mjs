import test from 'node:test';
import assert from 'node:assert/strict';
import { createActionsContract } from './actions-contract.mjs';

const contract = createActionsContract();

test('idempotency key matches the format user_id:match_id:action_type', () => {
  const u = '11111111-1111-1111-1111-111111111111';
  const m = '22222222-2222-2222-2222-222222222222';
  const key = contract.idempotencyKey(u, m, 'calendar_event');
  assert.equal(key, `${u}:${m}:calendar_event`);
  assert.throws(() => contract.idempotencyKey(u, m, 'invalid_action'), /UNPERMITTED_ACTION_TYPE/);
  assert.throws(() => contract.idempotencyKey('', m, 'calendar_event'), /MISSING_KEY_PARAMETERS/);
});

test('safe actions pass and risky external actions are strictly blocked', () => {
  for (const safe of ['tracker_update', 'calendar_event', 'email_notification', 'followup_schedule']) {
    assert.equal(contract.validateActionSafety(safe), true);
  }
  for (const risky of ['submit_application', 'send_email_as_user', 'share_profile_external']) {
    assert.throws(() => contract.validateActionSafety(risky), /RISKY_ACTION_BLOCKED/);
  }
});

test('iCalendar generation produces compliant VEVENT structure', () => {
  const ics = contract.formatIcsEvent({
    title: 'Software Engineering Internship',
    organization: 'Acme Corp',
    deadline: '2026-10-25',
    applicationUrl: 'https://example.com/apply',
    matchScore: 92
  });

  assert.ok(ics.includes('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('BEGIN:VEVENT'));
  assert.ok(ics.includes('SUMMARY:Deadline: Software Engineering Internship (Acme Corp)'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261025'));
  assert.ok(ics.includes('URL:https://example.com/apply'));
  assert.ok(ics.includes('END:VEVENT'));
  assert.ok(ics.includes('END:VCALENDAR'));
});

test('notification email summarizes opportunity, match, and safe actions', () => {
  const email = contract.formatNotificationEmail({
    userEmail: 'student@example.com',
    opportunity: {
      title: 'Backend Internship',
      organization: 'Tech Lab',
      deadline: '2026-10-30',
      application_url: 'https://example.com/apply'
    },
    match: {
      match_score: 95,
      confidence: 0.98
    },
    actionResults: {
      calendarEvent: true
    }
  });

  assert.ok(email.subject.includes('[OpportunityOS] Backend Internship'));
  assert.ok(email.text.includes('Match Score: 95/100'));
  assert.ok(email.text.includes('Confidence: 98%'));
  assert.ok(email.text.includes('NEVER automatically submit'));
});

test('approval email opens an authenticated confirmation page without a resume capability', () => {
  const confirmationUrl = 'http://localhost:3000/approvals/11111111-1111-4111-a111-111111111111?revision=2';
  const approval = contract.formatApprovalEmail({
    confirmationUrl,
    opportunity: {
      title: 'Open Source Fellowship',
      organization: 'Foundation'
    },
    match: {
      explanation: 'Missing explicit application deadline.'
    }
  });

  assert.equal(approval.confirmationUrl,confirmationUrl);
  assert.ok(approval.text.includes(confirmationUrl));
  assert.ok(!approval.text.includes('webhook-waiting'));
  assert.ok(approval.subject.includes('[OpportunityOS Action Needed]'));
});
