import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createDecisionContract} from './decision-contract.mjs';
import {createActionsContract} from './actions-contract.mjs';

const hash = s => createHash('sha256').update(s).digest('hex');
const defaultContract = createDecisionContract({hash});
const unlockedContract = createDecisionContract({hash, enableMissingDeadlinePolicy: true});
const actions = createActionsContract();
const pack = JSON.parse(readFileSync(new URL('../testdata/slice3-fixtures.json', import.meta.url), 'utf8'));
const base = pack.fixtures[0];
const clone = () => structuredClone(base.input);

test('Gate S1 (Flag Off): behaves identically to decision-v1', () => {
  assert.equal(defaultContract.version, 'decision-v1');
  const input = clone();
  input.opportunity.deadline = null; // No deadline
  
  // Under flag off, missing deadline produces UNKNOWN and ASK
  const result = defaultContract.decide(input, base.match, pack.now);
  assert.equal(result.eligibility_status, 'UNKNOWN');
  assert.equal(result.decision, 'ASK');
  assert.ok(result.reason_codes.includes('UNKNOWN_ELIGIBILITY'));
});

test('Gate S1 (Flag On): eligible internship with no deadline gives ACT with tracker and notification only', () => {
  assert.equal(unlockedContract.version, 'decision-v2');
  const input = clone();
  input.opportunity.type = 'internship';
  input.opportunity.deadline = null; // No stated deadline

  const result = unlockedContract.decide(input, base.match, pack.now);
  assert.equal(result.eligibility_status, 'ELIGIBLE');
  assert.equal(result.decision, 'ACT');
  assert.deepEqual(result.reason_codes, ['ELIGIBLE_NO_DEADLINE_TRACK']);
  
  // Deadline check is NOT_STATED, not UNKNOWN
  const deadlineCheck = result.eligibility_checks.find(c => c.kind === 'deadline');
  assert.ok(deadlineCheck);
  assert.equal(deadlineCheck.status, 'NOT_STATED');

  // Verify Action Authorization: tracker_update and email_notification are allowed
  const context = {
    user_id: 'user-123',
    match_id: 'match-123',
    action_id: 'action-123',
    claim_token: 'token-123',
    match: {
      status: 'complete',
      decision: 'ACT',
      eligibility_status: 'ELIGIBLE',
      evaluation_day: actions.day(new Date(pack.now))
    },
    opportunity: {
      title: input.opportunity.title,
      type: 'internship',
      deadline: null // No deadline
    }
  };

  // Internal tracker update is authorized
  assert.equal(actions.authorize({...context, type: 'tracker_update'}, new Date(pack.now)), true);
  
  // Email notification is authorized
  assert.equal(actions.authorize({...context, type: 'email_notification'}, new Date(pack.now)), true);

  // Calendar event is BLOCKED (POLICY_CHANGED because no deadline exists)
  assert.throws(() => actions.authorize({...context, type: 'calendar_event'}, new Date(pack.now)), /POLICY_CHANGED/);

  // Calendar link is BLOCKED
  assert.throws(() => actions.authorize({...context, type: 'calendar_link'}, new Date(pack.now)), /POLICY_CHANGED/);
});

test('Gate S1 (Flag On): hackathon with no deadline stays ASK', () => {
  const input = clone();
  input.opportunity.type = 'hackathon';
  input.opportunity.deadline = null;

  const result = unlockedContract.decide(input, base.match, pack.now);
  assert.equal(result.eligibility_status, 'UNKNOWN');
  assert.equal(result.decision, 'ASK');
  assert.ok(result.reason_codes.includes('UNKNOWN_ELIGIBILITY'));
});

test('Gate S1 (Flag On): stated CGPA requirement the student fails gives IGNORE (INELIGIBLE)', () => {
  const input = clone();
  input.profile.cgpa = 7.0; // Student has 7.0
  input.requirements = [
    {
      kind: 'cgpa',
      value: '8.0',
      mandatory: true,
      normalized_value: {scale: 10, minimum: 8.0},
      evidence_snippet: 'Minimum CGPA 8.0/10 required.'
    }
  ];

  const result = unlockedContract.decide(input, base.match, pack.now);
  assert.equal(result.eligibility_status, 'INELIGIBLE');
  assert.equal(result.decision, 'IGNORE');
  assert.ok(result.reason_codes.includes('INELIGIBLE'));
});

test('Gate S1 (Flag On): requirement the posting never states does not block eligibility', () => {
  const input = clone();
  // Profile has no CGPA or graduation year entered
  input.profile.cgpa = null;
  input.profile.graduation_year = null;
  // Opportunity only requires branch: Computer Science
  input.requirements = [
    {
      kind: 'branch',
      value: 'Computer Science',
      mandatory: true,
      normalized_value: {allowed: ['computer science']},
      evidence_snippet: 'Only Computer Science students are eligible.'
    }
  ];

  const result = unlockedContract.decide(input, base.match, pack.now);
  assert.equal(result.eligibility_status, 'ELIGIBLE');
});

test('Gate S1: UNKNOWN mandatory eligibility still gives ASK and cannot be bypassed', () => {
  const input = clone();
  input.requirements = [
    {
      kind: 'skill',
      value: 'Rust',
      mandatory: true,
      normalized_value: {name: 'rust'},
      evidence_snippet: 'Mandatory proficiency in Rust.'
    }
  ];
  // Student profile only has python, react, sql (no Rust)
  const result = unlockedContract.decide(input, base.match, pack.now);
  assert.equal(result.eligibility_status, 'UNKNOWN');
  assert.equal(result.decision, 'ASK');
  assert.ok(result.reason_codes.includes('UNKNOWN_ELIGIBILITY'));
});
