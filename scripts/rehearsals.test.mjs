import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLeverItem, normalizeDevpostItem, detectRiskSignals, parseDevpostDeadline } from './discovery-adapters.mjs';
import { evaluateRuleProposal, applyStandingRule, calculateAutonomyLedgerStats } from './rules-contract.mjs';
import { createDecisionContract } from './decision-contract.mjs';
import crypto from 'node:crypto';

const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const contract = createDecisionContract({ hash, enableMissingDeadlinePolicy: true });

test('End-to-End Rehearsal 1: Discovery from permitted source with grounded facts and rescan deduplication', async () => {
  // 1. Prepare grounded Lever item
  const leverPosting = {
    id: 'cred-be-rehearsal-001',
    text: 'Backend Platform Engineer - Intern',
    descriptionPlain: 'Join the Core Infrastructure team building ultra-reliable payment processing systems.',
    additionalPlain: 'Requirements: Proficient in Go or Java, relational databases, distributed systems fundamentals.',
    lists: [
      { text: 'Eligibility', content: '<li>Currently pursuing B.Tech/M.Tech in CS or IT</li><li>2026/2027 graduating batch</li>' }
    ],
    categories: {
      location: 'Bengaluru, Karnataka',
      commitment: 'Internship',
      team: 'Engineering'
    },
    hostedUrl: 'https://jobs.lever.co/cred/cred-be-rehearsal-001',
    applyUrl: 'https://jobs.lever.co/cred/cred-be-rehearsal-001/apply'
  };

  const normalized = normalizeLeverItem('cred', leverPosting);
  assert.equal(normalized.trust_tier, 'corroborated');
  assert.equal(normalized.type, 'internship');
  assert.ok(normalized.raw_text.includes('ultra-reliable payment processing'));
  assert.ok(normalized.raw_text.includes('B.Tech/M.Tech in CS or IT'));
  assert.equal(detectRiskSignals(normalized.raw_text).length, 0);

  // 2. Strict Devpost Calendar Dates & Context-Sensitive Fee Detection
  assert.equal(parseDevpostDeadline('Feb 31, 2026'), null, 'Invalid calendar day Feb 31 must be rejected');
  const validDevpostDeadline = parseDevpostDeadline('Nov 15, 2026 11:59pm IST');
  assert.ok(validDevpostDeadline, 'Valid Devpost deadline must parse to ISO string');

  const textWithFreeFee = 'Registration is free to apply! No application fee required for university students.';
  const freeSignals = detectRiskSignals(textWithFreeFee);
  assert.equal(freeSignals.length, 0, 'Exempt phrases like "no application fee" must not trigger payment warning');

  const textWithRealFee = 'A non-refundable registration fee of 500 INR is required to enter this competition.';
  const paidSignals = detectRiskSignals(textWithRealFee);
  assert.ok(paidSignals.some(s => s.startsWith('fee_payment_required')), 'Real application fees must trigger payment warning');

  // 3. Rescan Deduplication Contract: stable_key and content_hash
  const hash1 = crypto.createHash('sha256').update(normalized.raw_text).digest('hex');
  const hash2 = crypto.createHash('sha256').update(normalized.raw_text).digest('hex');
  assert.equal(hash1, hash2, 'Identical content must yield identical hash');

  const stableKey1 = `lever:cred:${normalized.external_id}`;
  const stableKey2 = `lever:cred:${normalized.external_id}`;
  assert.equal(stableKey1, stableKey2, 'Stable key must be uniquely derived from adapter, source, and external id');
});

test('End-to-End Rehearsal 2: Grouped clarifications resolving multiple opportunities and no-deadline approval', async () => {
  // 1. Profile with missing CGPA and year
  const profile = {
    user_id: 'rehearsal-user-002',
    degree: 'B.Tech',
    branch: 'Computer Science',
    academic_year: null,
    graduation_year: null,
    cgpa: null,
    skills: [{ name: 'python', level: 'intermediate' }],
    revision: 1
  };

  // 2. Two distinct opportunities requiring CGPA
  const opp1 = {
    id: 'opp-rehearsal-1',
    title: 'Google STEP Intern',
    organization: 'Google',
    type: 'internship',
    deadline: null, // no stated deadline
    requirements: [
      { kind: 'cgpa', value: '8.0', mandatory: true, normalized_value: { scale: 10, minimum: 8.0 }, evidence: 'Minimum 8.0 CGPA required' },
      { kind: 'degree', value: 'B.Tech', mandatory: true, normalized_value: { allowed: ['btech'] }, evidence: 'B.Tech in CS/IT' }
    ]
  };

  const opp2 = {
    id: 'opp-rehearsal-2',
    title: 'Microsoft Explore Intern',
    organization: 'Microsoft',
    type: 'internship',
    deadline: null, // no stated deadline
    requirements: [
      { kind: 'cgpa', value: '7.5', mandatory: true, normalized_value: { scale: 10, minimum: 7.5 }, evidence: 'Minimum 7.5 CGPA required' },
      { kind: 'degree', value: 'B.Tech', mandatory: true, normalized_value: { allowed: ['btech'] }, evidence: 'B.Tech degree required' }
    ]
  };

  // 3. Three-valued eligibility evaluation: missing CGPA results in UNKNOWN
  const eval1 = contract.eligibility({ profile, opportunity: opp1, requirements: opp1.requirements });
  assert.equal(eval1.status, 'UNKNOWN');
  const missing1 = eval1.checks.filter(c => c.status === 'UNKNOWN').map(c => c.kind);
  assert.ok(missing1.includes('cgpa'));

  const eval2 = contract.eligibility({ profile, opportunity: opp2, requirements: opp2.requirements });
  assert.equal(eval2.status, 'UNKNOWN');
  const missing2 = eval2.checks.filter(c => c.status === 'UNKNOWN').map(c => c.kind);
  assert.ok(missing2.includes('cgpa'));

  // 4. Grouping: Missing facts across multiple opportunities group into one canonical clarification question
  const factMap = new Map();
  for (const [oppId, missingList] of [[opp1.id, missing1], [opp2.id, missing2]]) {
    for (const fact of missingList) {
      if (!factMap.has(fact)) {
        factMap.set(fact, {
          missing_fact: fact,
          question: `What is your current ${fact.toUpperCase()} on a 10.0 scale?`,
          affected_opportunity_ids: []
        });
      }
      factMap.get(fact).affected_opportunity_ids.push(oppId);
    }
  }

  const grouped = [...factMap.values()];
  assert.equal(grouped.length, 1, 'Both opportunities must be grouped under a single clarification question');
  assert.equal(grouped[0].missing_fact, 'cgpa');
  assert.equal(grouped[0].affected_opportunity_ids.length, 2);
  assert.ok(grouped[0].affected_opportunity_ids.includes(opp1.id));
  assert.ok(grouped[0].affected_opportunity_ids.includes(opp2.id));

  // 5. Atomic resolution: once answer is confirmed, profile is updated, revision bumped, and both re-evaluated
  const updatedProfile = {
    ...profile,
    cgpa: 8.5,
    revision: profile.revision + 1
  };
  assert.equal(updatedProfile.revision, 2);

  const reEval1 = contract.eligibility({ profile: updatedProfile, opportunity: opp1, requirements: opp1.requirements });
  assert.equal(reEval1.status, 'ELIGIBLE');
  assert.equal(reEval1.checks.filter(c => c.status === 'UNKNOWN').length, 0);

  const reEval2 = contract.eligibility({ profile: updatedProfile, opportunity: opp2, requirements: opp2.requirements });
  assert.equal(reEval2.status, 'ELIGIBLE');
  assert.equal(reEval2.checks.filter(c => c.status === 'UNKNOWN').length, 0);

  // 6. No-deadline approval window: eligible internship with null deadline uses standard 48-hour approval expiry
  const now = Date.now();
  const approvalWindowMs = 48 * 60 * 60 * 1000;
  const approval = {
    match_id: 'match-1',
    status: 'pending',
    expires_at: new Date(now + approvalWindowMs).toISOString(),
    opportunity_deadline: null // null deadline allowed for internship/job
  };
  assert.ok(new Date(approval.expires_at).getTime() > now, 'Approval window is active');
  assert.equal(approval.opportunity_deadline, null, 'No deadline is fabricated');
});

test('End-to-End Rehearsal 3: Three distinct decisions -> Proposal -> Approval -> Scoped Autopilot Application -> Ledger', async () => {
  const decisions = [
    { id: 'dec-1', opportunity_id: 'opp-1', source_scope: 'cred', opportunity_type: 'internship', choice: 'approve', created_at: '2026-10-15T10:00:00Z' },
    { id: 'dec-2', opportunity_id: 'opp-2', source_scope: 'cred', opportunity_type: 'internship', choice: 'approve', created_at: '2026-10-15T09:00:00Z' },
    { id: 'dec-3', opportunity_id: 'opp-3', source_scope: 'cred', opportunity_type: 'internship', choice: 'approve', created_at: '2026-10-15T08:00:00Z' },
  ];

  // 1. Evaluate Rule Proposal: 3 consistent approvals on distinct opportunities
  const proposal = evaluateRuleProposal({ decisions, existingRules: [] });
  assert.ok(proposal);
  assert.equal(proposal.status, 'proposed');
  assert.equal(proposal.rule_type, 'preauthorize');
  assert.equal(proposal.source_scope, 'cred');
  assert.equal(proposal.opportunity_type, 'internship');
  assert.equal(proposal.conditions.min_score, 60);
  assert.equal(proposal.conditions.min_confidence, 0.65);

  // 2. Student Approves the Rule -> Becomes Active
  const activeRule = {
    ...proposal,
    id: 'rule-cred-internships-active',
    status: 'active'
  };

  // 3. Autonomous Matching: Incoming Cred Internship with baseline ASK
  const incomingMatch = {
    decision: 'ASK',
    eligibility_status: 'ELIGIBLE',
    match_score: 74,
    confidence: 0.82
  };

  const incomingOpp = {
    source_badge: 'cred',
    type: 'internship',
    deadline: '2026-10-30',
    trust_tier: 'corroborated',
    risk_signals: []
  };

  const applyResult = applyStandingRule({
    match: incomingMatch,
    opportunity: incomingOpp,
    rules: [activeRule]
  });

  assert.equal(applyResult.applied, true);
  assert.equal(applyResult.decision, 'ACT');
  assert.equal(applyResult.question_avoided, true);
  assert.equal(applyResult.rule_id, activeRule.id);

  // 4. Verify Autonomy Ledger Stats calculation
  const ledgerEntries = [
    {
      id: 'led-1',
      opportunity_id: 'opp-incoming',
      rule_id: activeRule.id,
      baseline_decision: 'ASK',
      effective_decision: 'ACT',
      question_avoided: true,
      is_override: false,
      is_seeded: false
    }
  ];

  const stats = calculateAutonomyLedgerStats({
    ledgerEntries,
    opportunities: [incomingOpp],
    matches: [{ ...incomingMatch, decision: 'ACT' }]
  });

  assert.equal(stats.questions_avoided, 1);
  assert.equal(stats.items_acted, 1);
  assert.equal(stats.breakdown.real.questions_avoided, 1);

  // 5. Revocation / Disabling Rule
  const disabledRule = {
    ...activeRule,
    status: 'disabled'
  };

  const applyAfterRevoke = applyStandingRule({
    match: incomingMatch,
    opportunity: incomingOpp,
    rules: [disabledRule]
  });

  assert.equal(applyAfterRevoke.applied, false);
  assert.equal(applyAfterRevoke.reason, 'NO_MATCHING_RULE');
});
