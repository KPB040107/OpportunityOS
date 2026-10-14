import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRuleProposal, applyStandingRule, calculateAutonomyLedgerStats } from './rules-contract.mjs';

test('Gate S3: Three consistent decisions propose a typed rule', () => {
  const decisions = [
    { id: 'dec-1', source_scope: 'lever', opportunity_type: 'internship', choice: 'approve', created_at: '2026-10-15T10:00:00Z' },
    { id: 'dec-2', source_scope: 'lever', opportunity_type: 'internship', choice: 'approve', created_at: '2026-10-15T09:00:00Z' },
    { id: 'dec-3', source_scope: 'lever', opportunity_type: 'internship', choice: 'approve', created_at: '2026-10-15T08:00:00Z' },
  ];

  const proposal = evaluateRuleProposal({ decisions, existingRules: [] });
  assert.ok(proposal, 'Should produce a rule proposal');
  assert.equal(proposal.status, 'proposed');
  assert.equal(proposal.rule_type, 'preauthorize');
  assert.equal(proposal.source_scope, 'lever');
  assert.equal(proposal.opportunity_type, 'internship');
  assert.deepEqual(proposal.supporting_decision_ids, ['dec-1', 'dec-2', 'dec-3']);
  assert.equal(proposal.conditions.min_score, 60);
  assert.equal(proposal.conditions.min_confidence, 0.65);
});

test('Gate S3: Disagreement does not propose a rule', () => {
  const decisions = [
    { id: 'dec-1', source_scope: 'lever', opportunity_type: 'internship', choice: 'approve', created_at: '2026-10-15T10:00:00Z' },
    { id: 'dec-2', source_scope: 'lever', opportunity_type: 'internship', choice: 'reject', created_at: '2026-10-15T09:00:00Z' },
    { id: 'dec-3', source_scope: 'lever', opportunity_type: 'internship', choice: 'approve', created_at: '2026-10-15T08:00:00Z' },
  ];

  const proposal = evaluateRuleProposal({ decisions, existingRules: [] });
  assert.equal(proposal, null, 'Disagreement should yield no proposal');
});

test('Gate S3: Existing active or proposed rule prevents duplicate proposal', () => {
  const decisions = [
    { id: 'dec-1', source_scope: 'lever', opportunity_type: 'internship', choice: 'approve', created_at: '2026-10-15T10:00:00Z' },
    { id: 'dec-2', source_scope: 'lever', opportunity_type: 'internship', choice: 'approve', created_at: '2026-10-15T09:00:00Z' },
    { id: 'dec-3', source_scope: 'lever', opportunity_type: 'internship', choice: 'approve', created_at: '2026-10-15T08:00:00Z' },
  ];

  const existingRules = [
    { id: 'rule-existing', source_scope: 'lever', opportunity_type: 'internship', status: 'active' }
  ];

  const proposal = evaluateRuleProposal({ decisions, existingRules });
  assert.equal(proposal, null, 'Existing active rule should block duplicate proposal');
});

test('Gate S3: Scope conflict - rule for internships does not apply to jobs or hackathons', () => {
  const activeRule = {
    id: 'rule-internship',
    status: 'active',
    rule_type: 'preauthorize',
    source_scope: 'lever',
    opportunity_type: 'internship',
    conditions: { min_score: 60, min_confidence: 0.65 }
  };

  const jobOpportunity = {
    source_badge: 'lever',
    type: 'job',
    deadline: '2026-10-25',
    trust_tier: 'corroborated',
    risk_signals: []
  };

  const match = {
    decision: 'ASK',
    eligibility_status: 'ELIGIBLE',
    match_score: 75,
    confidence: 0.8
  };

  const res = applyStandingRule({ match, opportunity: jobOpportunity, rules: [activeRule] });
  assert.equal(res.applied, false);
  assert.equal(res.reason, 'NO_MATCHING_RULE');
});

test('Gate S3: Inactive, rejected, or disabled rule cannot act', () => {
  const disabledRule = {
    id: 'rule-disabled',
    status: 'disabled',
    rule_type: 'preauthorize',
    source_scope: 'lever',
    opportunity_type: 'internship',
    conditions: { min_score: 60, min_confidence: 0.65 }
  };

  const opportunity = {
    source_badge: 'lever',
    type: 'internship',
    deadline: '2026-10-25',
    trust_tier: 'corroborated',
    risk_signals: []
  };

  const match = {
    decision: 'ASK',
    eligibility_status: 'ELIGIBLE',
    match_score: 75,
    confidence: 0.8
  };

  const res = applyStandingRule({ match, opportunity, rules: [disabledRule] });
  assert.equal(res.applied, false);
  assert.equal(res.reason, 'NO_MATCHING_RULE');
});

test('Gate S3: Rules cannot act on UNKNOWN, INELIGIBLE, expired, unverified or risk-flagged items', () => {
  const activeRule = {
    id: 'rule-1',
    status: 'active',
    rule_type: 'preauthorize',
    source_scope: 'lever',
    opportunity_type: 'internship',
    conditions: { min_score: 60, min_confidence: 0.65 }
  };

  const baseOpp = {
    source_badge: 'lever',
    type: 'internship',
    deadline: '2026-10-25',
    trust_tier: 'corroborated',
    risk_signals: []
  };

  const baseMatch = {
    decision: 'ASK',
    eligibility_status: 'ELIGIBLE',
    match_score: 75,
    confidence: 0.8
  };

  // Case 1: Ineligible
  const ineligRes = applyStandingRule({
    match: { ...baseMatch, eligibility_status: 'INELIGIBLE' },
    opportunity: baseOpp,
    rules: [activeRule]
  });
  assert.equal(ineligRes.applied, false);
  assert.equal(ineligRes.reason, 'INELIGIBLE_OR_UNKNOWN');

  // Case 2: Unknown eligibility
  const unknownRes = applyStandingRule({
    match: { ...baseMatch, eligibility_status: 'UNKNOWN' },
    opportunity: baseOpp,
    rules: [activeRule]
  });
  assert.equal(unknownRes.applied, false);
  assert.equal(unknownRes.reason, 'INELIGIBLE_OR_UNKNOWN');

  // Case 3: Expired deadline
  const expiredRes = applyStandingRule({
    match: baseMatch,
    opportunity: { ...baseOpp, deadline: '2026-10-01' },
    rules: [activeRule],
    now: '2026-10-15T00:00:00Z'
  });
  assert.equal(expiredRes.applied, false);
  assert.equal(expiredRes.reason, 'EXPIRED');

  // Case 4: Unverified trust tier
  const unverifiedRes = applyStandingRule({
    match: baseMatch,
    opportunity: { ...baseOpp, trust_tier: 'unverified' },
    rules: [activeRule]
  });
  assert.equal(unverifiedRes.applied, false);
  assert.equal(unverifiedRes.reason, 'UNVERIFIED_OR_RISK');

  // Case 5: Risk signals present
  const riskRes = applyStandingRule({
    match: baseMatch,
    opportunity: { ...baseOpp, risk_signals: ['requires_payment_or_fee'] },
    rules: [activeRule]
  });
  assert.equal(riskRes.applied, false);
  assert.equal(riskRes.reason, 'UNVERIFIED_OR_RISK');

  // Case 6: Score below preauthorization floor (score 55 < 60)
  const lowScoreRes = applyStandingRule({
    match: { ...baseMatch, match_score: 55, confidence: 0.8 },
    opportunity: baseOpp,
    rules: [activeRule]
  });
  assert.equal(lowScoreRes.applied, false);
  assert.equal(lowScoreRes.reason, 'BELOW_RULE_FLOOR');
});

test('Gate S3: Active rule successfully preauthorizes eligible ASK and avoids question', () => {
  const activeRule = {
    id: 'rule-lever-intern',
    status: 'active',
    rule_type: 'preauthorize',
    source_scope: 'lever',
    opportunity_type: 'internship',
    title: 'Auto-track Lever internships',
    conditions: { min_score: 60, min_confidence: 0.65 },
    allowed_action_types: ['tracker_update', 'email_notification']
  };

  const opportunity = {
    source_badge: 'lever',
    type: 'internship',
    deadline: '2026-10-25',
    trust_tier: 'corroborated',
    risk_signals: []
  };

  const match = {
    decision: 'ASK',
    eligibility_status: 'ELIGIBLE',
    match_score: 68,
    confidence: 0.72
  };

  const res = applyStandingRule({ match, opportunity, rules: [activeRule] });
  assert.equal(res.applied, true);
  assert.equal(res.decision, 'ACT');
  assert.equal(res.question_avoided, true);
  assert.equal(res.rule_id, 'rule-lever-intern');
  assert.deepEqual(res.allowed_action_types, ['tracker_update', 'email_notification']);
});

test('Gate S3: Autonomy ledger stats and Home counter calculate accurately with seeded separation', () => {
  const opportunities = [
    { id: '1', is_seeded: false },
    { id: '2', is_seeded: false },
    { id: '3', is_seeded: true, raw_content: 'DEMO DATA simulated announcement' }
  ];

  const matches = [
    { decision: 'ACT' },
    { decision: 'ASK' },
    { decision: 'IGNORE' }
  ];

  const ledgerEntries = [
    { question_avoided: true, is_seeded: false },
    { question_avoided: true, is_seeded: true },
    { question_avoided: false, is_seeded: false }
  ];

  const stats = calculateAutonomyLedgerStats({ ledgerEntries, opportunities, matches });
  assert.equal(stats.items_read, 3);
  assert.equal(stats.items_ignored, 1);
  assert.equal(stats.items_acted, 1);
  assert.equal(stats.items_asked, 1);
  assert.equal(stats.questions_avoided, 1);
  assert.equal(stats.breakdown.real.items_read, 2);
  assert.equal(stats.breakdown.real.questions_avoided, 1);
  assert.equal(stats.breakdown.seeded.items_read, 1);
  assert.equal(stats.breakdown.seeded.questions_avoided, 1);
});
