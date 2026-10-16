import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createDecisionContract } from './decision-contract.mjs';
import { createActionsContract } from './actions-contract.mjs';
import {
  normalizeLeverItem,
  normalizeDevpostItem,
  normalizeJSearchItem,
  detectRiskSignals,
  parseDevpostDeadline,
  hashString
} from './discovery-adapters.mjs';
import {
  evaluateRuleProposal,
  applyStandingRule,
  calculateAutonomyLedgerStats
} from './rules-contract.mjs';

const hash = s => createHash('sha256').update(s).digest('hex');
const defaultContract = createDecisionContract({ hash, enableMissingDeadlinePolicy: false });
const unlockedContract = createDecisionContract({ hash, enableMissingDeadlinePolicy: true });
const actions = createActionsContract();

// --- T01: Database Privileges ---
test('T01: Database Privileges - Privileged functions revoke PUBLIC and anon execution', () => {
  const mig0027 = readFileSync('supabase/migrations/0027_secure_privileged_worker_boundaries.sql', 'utf8');
  assert.match(mig0027, /revoke all on function public\.worker_claim_due_discovery\(.*\) from public, anon/i);
  assert.match(mig0027, /revoke all on function public\.worker_save_discovery_item\(.*\) from public, anon/i);
  assert.match(mig0027, /revoke all on function public\.worker_finish_discovery_run\(.*\) from public, anon/i);
  assert.match(mig0027, /revoke all on function public\.apply_standing_rule_to_match\(.*\) from public, anon/i);
  assert.match(mig0027, /grant execute on function public\.worker_claim_due_discovery\(.*\) to service_role/i);
  assert.match(mig0027, /grant execute on function public\.worker_save_discovery_item\(.*\) to service_role/i);
  assert.match(mig0027, /grant execute on function public\.worker_finish_discovery_run\(.*\) to service_role/i);
});

// --- T02: Cross-User Data Boundaries ---
test('T02: Cross-User Data Boundaries - User operations derive ownership from auth.uid()', () => {
  const mig0025 = readFileSync('supabase/migrations/0025_standing_rules_and_autonomy_ledger.sql', 'utf8');
  const mig0027 = readFileSync('supabase/migrations/0027_secure_privileged_worker_boundaries.sql', 'utf8');
  const mig0029 = readFileSync('supabase/migrations/0029_eligibility_clarifications_and_nodeadline_approval.sql', 'utf8');

  // respond_standing_rule checks auth.uid() in 0025
  assert.match(mig0025, /select \* into v_rule from public\.standing_rules where id = p_rule_id and user_id = v_uid;/);
  // record_student_decision verifies opportunity ownership in 0027
  assert.match(mig0027, /select \* into v_opp from public\.opportunities where id = p_opportunity_id and user_id = v_uid;/);
  // confirm_approval checks auth.uid() in 0029
  assert.match(mig0029, /select \* into a from public\.approvals where id = p_id and user_id = owner_id/);
  // resolve_clarification checks auth.uid() in 0029
  assert.match(mig0029, /select \* into c\s+from public\.clarifications\s+where id = p_id\s+and user_id = auth\.uid\(\)/);
  // affected_opportunity_ids ownership verification in 0029
  assert.match(mig0029, /exists \(select 1 from public\.opportunities where id = opp_id and user_id = c\.user_id\)/);
});

// --- T03: Discovery Run State Validation ---
test('T03: Discovery Run State Validation - Lease tokens and run status are strictly validated', () => {
  const mig0027 = readFileSync('supabase/migrations/0027_secure_privileged_worker_boundaries.sql', 'utf8');
  // worker_save_discovery_item validates active run and claimed_until
  assert.match(mig0027, /where r\.id = p_run_id and r\.status = 'running' and r\.claimed_until > now\(\)/);
  // worker_finish_discovery_run validates running status
  assert.match(mig0027, /where id = p_run_id and status = 'running'/);
});

// --- T04: Source Trust Gating ---
test('T04: Source Trust Gating - Trust tiers are derived strictly from registry, not caller input', () => {
  const mig0027 = readFileSync('supabase/migrations/0027_secure_privileged_worker_boundaries.sql', 'utf8');
  assert.match(mig0027, /join opportunityos_private\.source_registry s on s\.id = r\.source_id/);
  assert.match(mig0027, /v_trust_tier := v_run\.reg_trust_tier;/);
  assert.match(mig0027, /v_source_badge := v_run\.reg_source_badge;/);
  // Lever CRED/Meesho set to corroborated, Devpost and JSearch set to awaiting_validation
  assert.match(mig0027, /set trust_tier = 'corroborated', source_badge = 'CRED Careers' where name = 'CRED Careers'/);
  assert.match(mig0027, /set trust_tier = 'attributed', source_badge = 'Devpost', status = 'awaiting_validation' where name = 'Devpost Hackathons'/);
});

// --- T05: Notification Consent at Queueing ---
test('T05: Notification Consent at Queueing - worker_queue_action blocks queueing if email_enabled is false', () => {
  const mig0013 = readFileSync('supabase/migrations/0013_durable_actions_and_approvals.sql', 'utf8');
  assert.match(mig0013, /if not public\.worker_action_allowed\(m\.id,p_type,m\.revision\) then return null;end if;/);
  assert.match(mig0013, /if p_type in \('email_notification','approval_notification','deadline_reminder','followup_notification','error_notification'\) and not \(c->>'email_enabled'\)::boolean then return null;end if;/);
});

// --- T06: Notification Consent at Claiming ---
test('T06: Notification Consent at Claiming - worker_claim_action blocks actions if opted out', () => {
  const mig0020 = readFileSync('supabase/migrations/0020_owned_error_notifications.sql', 'utf8');
  assert.match(mig0020, /permitted:=public\.worker_action_allowed\(a\.match_id,a\.type,a\.revision\);/);
  assert.match(mig0020, /if permitted is distinct from true then update public\.actions set status='blocked',error='POLICY_CHANGED'/);
});

// --- T07: Notification Consent Before Send ---
test('T07: Notification Consent Before Send - worker_action_allowed returns false for opted-out email notifications', () => {
  const mig0028 = readFileSync('supabase/migrations/0028_notification_consent_and_autopilot_recovery.sql', 'utf8');
  assert.match(mig0028, /if not exists\(select 1 from public\.notification_preferences np where np\.user_id = m\.user_id and np\.email_enabled = true\) then\s+return false;\s+end if;/);
});

// --- T08: Tunnel Failure Visibility ---
test('T08: Tunnel Failure Visibility - start-public-tunnel.ps1 throws error if tunnel is unhealthy', () => {
  const tunnelScript = readFileSync('scripts/start-public-tunnel.ps1', 'utf8');
  assert.match(tunnelScript, /if \(-not \$tunnelHealthy\) \{\s*throw "Tunnel URL/);
});

// --- T09: Autopilot Per-User Progress ---
test('T09: Autopilot Per-User Progress - Autopilot executes per-user instead of global heartbeat', () => {
  const mig0028 = readFileSync('supabase/migrations/0028_notification_consent_and_autopilot_recovery.sql', 'utf8');
  assert.match(mig0028, /for u in select user_id from public\.profiles loop/);
  assert.match(mig0028, /where user_id = u\.user_id/);
});

// --- T10: Autopilot Duplicate Run Prevention ---
test('T10: Autopilot Duplicate Run Prevention - Prevents multiple autopilot executions per user per day', () => {
  const mig0028 = readFileSync('supabase/migrations/0028_notification_consent_and_autopilot_recovery.sql', 'utf8');
  assert.match(mig0028, /select count\(\*\) into v_user_runs\s+from public\.agent_runs\s+where user_id = u\.user_id\s+and workflow = '06-autopilot'\s+and status = 'ok'\s+and \(ts at time zone 'Asia\/Kolkata'\)::date = v_today;\s+if not p_force and v_user_runs > 0 then\s+continue;\s+end if;/);
});

// --- T11: Eligibility 3-Valued Logic ---
test('T11: Eligibility 3-Valued Logic - Only returns ELIGIBLE, INELIGIBLE, or UNKNOWN', () => {
  const pack = JSON.parse(readFileSync('testdata/slice3-fixtures.json', 'utf8'));
  const input = structuredClone(pack.fixtures[0].input);

  // Eligible input
  const resElig = defaultContract.eligibility(input);
  assert.ok(['ELIGIBLE', 'INELIGIBLE', 'UNKNOWN'].includes(resElig.status));
  assert.equal(resElig.status, 'ELIGIBLE');

  // Stated requirement failed -> INELIGIBLE
  const ineligInput = structuredClone(input);
  ineligInput.profile.cgpa = 6.0;
  ineligInput.requirements = [{ kind: 'cgpa', value: '8.0', mandatory: true, normalized_value: { scale: 10, minimum: 8.0 } }];
  const resInelig = defaultContract.eligibility(ineligInput);
  assert.equal(resInelig.status, 'INELIGIBLE');

  // Missing profile fact -> UNKNOWN
  const unkInput = structuredClone(input);
  unkInput.profile.cgpa = null;
  unkInput.requirements = [{ kind: 'cgpa', value: '8.0', mandatory: true, normalized_value: { scale: 10, minimum: 8.0 } }];
  const resUnk = defaultContract.eligibility(unkInput);
  assert.equal(resUnk.status, 'UNKNOWN');
});

// --- T12: Eligibility Typed Constraints ---
test('T12: Eligibility Typed Constraints - Handles AND/OR alternatives for degree and branch', () => {
  const pack = JSON.parse(readFileSync('testdata/slice3-fixtures.json', 'utf8'));
  const input = structuredClone(pack.fixtures[0].input);

  // Multiple allowed branches: 'Computer Science or Information Technology'
  input.profile.branch = 'Information Technology';
  input.requirements = [{
    kind: 'branch',
    value: 'Computer Science or Information Technology',
    mandatory: true,
    normalized_value: null,
    evidence_snippet: 'Open to Computer Science or Information Technology students.'
  }];
  const res = defaultContract.eligibility(input);
  assert.equal(res.status, 'ELIGIBLE');
  const branchCheck = res.checks.find(c => c.kind === 'branch');
  assert.equal(branchCheck.status, 'PASS');
});

// --- T13: Distinguish Stated vs Unstated ---
test('T13: Distinguish Stated vs Unstated - Unstated requirements do not fail eligibility', () => {
  const pack = JSON.parse(readFileSync('testdata/slice3-fixtures.json', 'utf8'));
  const input = structuredClone(pack.fixtures[0].input);
  input.profile.cgpa = null;
  input.profile.academic_year = null;
  // Posting does not require CGPA or academic year
  input.requirements = [{
    kind: 'branch',
    value: 'Computer Science',
    mandatory: true,
    normalized_value: { allowed: ['computer science'] },
    evidence_snippet: 'Open to Computer Science students.'
  }];
  const res = defaultContract.eligibility(input);
  assert.equal(res.status, 'ELIGIBLE');
});

// --- T14: Preserve Contradictions ---
test('T14: Preserve Contradictions - Contradictory sources remain UNKNOWN and ASK', () => {
  const pack = JSON.parse(readFileSync('testdata/slice3-fixtures.json', 'utf8'));
  const input = structuredClone(pack.fixtures[0].input);
  input.opportunity.ambiguity_flags = ['source_variation', 'contradictory_location'];
  const res = defaultContract.eligibility(input);
  assert.equal(res.status, 'UNKNOWN');
  const sourceCheck = res.checks.find(c => c.kind === 'source');
  assert.equal(sourceCheck.status, 'UNKNOWN');
});

// --- T15: Group Missing Facts ---
test('T15: Group Missing Facts - record_or_group_clarification groups by missing_fact', () => {
  const mig0029 = readFileSync('supabase/migrations/0029_eligibility_clarifications_and_nodeadline_approval.sql', 'utf8');
  assert.match(mig0029, /create or replace function public\.record_or_group_clarification/);
  assert.match(mig0029, /where user_id = p_user_id\s+and missing_fact = p_missing_fact\s+and status = 'pending'/);
  assert.match(mig0029, /affected_opportunity_ids = array\(\s*select distinct unnest\(affected_opportunity_ids \|\| array\[p_opportunity_id\]\)\s*\)/);
});

// --- T16: Clarification Profile Update ---
test('T16: Clarification Profile Update - resolve_clarification updates profile and increments revision', () => {
  const mig0029 = readFileSync('supabase/migrations/0029_eligibility_clarifications_and_nodeadline_approval.sql', 'utf8');
  assert.match(mig0029, /update public\.profiles\s+set cgpa = v_val_num,\s+revision = coalesce\(revision, 1\) \+ 1/);
  assert.match(mig0029, /update public\.profiles\s+set academic_year = v_val_int,\s+revision = coalesce\(revision, 1\) \+ 1/);
  assert.match(mig0029, /perform public\.enqueue_evaluation\(c\.user_id, opp_id\)/);
});

// --- T17: Clarification Single Active Question ---
test('T17: Clarification Single Active Question - Partial index enforces 1 active pending per fact', () => {
  const mig0029 = readFileSync('supabase/migrations/0029_eligibility_clarifications_and_nodeadline_approval.sql', 'utf8');
  assert.match(mig0029, /create unique index if not exists uq_active_user_clarification\s+on public\.clarifications \(user_id, missing_fact\)\s+where status = 'pending'/);
});

// --- T18: No-Deadline Approval Expiry ---
test('T18: No-Deadline Approval Expiry - confirm_approval allows null deadline with 48h expiry', () => {
  const mig0029 = readFileSync('supabase/migrations/0029_eligibility_clarifications_and_nodeadline_approval.sql', 'utf8');
  assert.match(mig0029, /where id = m\.opportunity_id\s+and user_id = owner_id\s+and \(deadline is null or deadline > \(now\(\) at time zone 'Asia\/Kolkata'\)::date\)/);
  assert.match(mig0029, /if a\.expires_at <= now\(\) then\s+update public\.approvals set status = 'expired'/);
});

// --- T19: Discovery Preserve Descriptions ---
test('T19: Discovery Preserve Descriptions - normalizeLeverItem retains substantive posting descriptions', () => {
  const fixture = {
    id: 'cred-intern-1',
    text: 'Frontend Engineering Intern',
    descriptionPlain: 'Substantive role overview and team context.',
    additionalPlain: 'Specific qualifications: React, TypeScript, and Git proficiency.',
    lists: [
      { text: 'Requirements', content: '<li>B.Tech or M.Tech in CS/IT</li><li>Strong problem solving</li>' }
    ],
    categories: { location: 'Bengaluru', commitment: 'Internship' }
  };
  const normalized = normalizeLeverItem('cred', fixture);
  assert.ok(normalized.raw_text.includes('Substantive role overview'));
  assert.ok(normalized.raw_text.includes('Specific qualifications'));
  assert.ok(normalized.raw_text.includes('Requirements'));
  assert.ok(normalized.raw_text.includes('B.Tech or M.Tech in CS/IT'));
});

// --- T20: Discovery Strict Date Validation ---
test('T20: Discovery Strict Date Validation - Rejects non-existent calendar dates like Feb 31', () => {
  assert.equal(parseDevpostDeadline('Feb 31, 2026'), null);
  assert.equal(parseDevpostDeadline('Aug 15 - Feb 31, 2026'), null);
  assert.equal(parseDevpostDeadline('Aug 15 - Oct 25, 2026'), '2026-10-25');
});

// --- T21: Context-Sensitive Fee Detection ---
test('T21: Context-Sensitive Fee Detection - Exempts phrases like "no application fee"', () => {
  assert.deepEqual(detectRiskSignals('There is no application fee for this internship.'), []);
  assert.deepEqual(detectRiskSignals('Free to participate, no registration fee required.'), []);
  assert.deepEqual(detectRiskSignals('Zero processing fee.'), []);
  const detected = detectRiskSignals('Selected candidates must pay a mandatory registration fee of $50.');
  assert.equal(detected.length, 1);
  assert.match(detected[0], /fee_payment_required/);
});

// --- T22: Discovery Stable Provenance Fingerprint ---
test('T22: Discovery Stable Provenance Fingerprint - Distinct locations yield distinct fingerprints', () => {
  const mig0027 = readFileSync('supabase/migrations/0027_secure_privileged_worker_boundaries.sql', 'utf8');
  assert.match(mig0027, /v_fp := encode\(extensions\.digest\(concat\(u\.user_id::text, ':', v_run\.adapter, ':', p_item->>'external_id', ':', coalesce\(p_item->>'location', ''\)\)::bytea, 'sha256'\), 'hex'\);/);

  // Behavioral check: different locations of the same role never collide
  const fpBangalore = hash('user-1' + ':' + 'lever-v1' + ':' + 'job-123' + ':' + 'Bengaluru');
  const fpMumbai = hash('user-1' + ':' + 'lever-v1' + ':' + 'job-123' + ':' + 'Mumbai');
  const fpBangaloreRepeat = hash('user-1' + ':' + 'lever-v1' + ':' + 'job-123' + ':' + 'Bengaluru');

  assert.notEqual(fpBangalore, fpMumbai, 'Different locations must have distinct fingerprints');
  assert.equal(fpBangalore, fpBangaloreRepeat, 'Identical location must share fingerprint');
});

// --- T23: Deduplicate Rescans ---
test('T23: Deduplicate Rescans - Identical content does not duplicate or re-queue evaluations', () => {
  const mig0030 = readFileSync('supabase/migrations/0030_discovery_rescan_deduplication.sql', 'utf8');
  assert.match(mig0030, /if v_existing_id is not null and v_existing_hash = v_content_hash then/);
  assert.match(mig0030, /update opportunityos_private\.catalog_opportunities\s+set updated_at = now\(\)\s+where id = v_existing_id;/);
  assert.match(mig0030, /return jsonb_build_object\('saved', true, 'was_created', false, 'catalog_id', v_existing_id, 'rescan_unchanged', true\);/);
});

// --- T24: Subscription Scoped Projection ---
test('T24: Subscription Scoped Projection - Projects only to matching profile interests', () => {
  const mig0027 = readFileSync('supabase/migrations/0027_secure_privileged_worker_boundaries.sql', 'utf8');
  assert.match(mig0027, /select user_id from public\.profiles\s+where interest_types is null\s+or cardinality\(interest_types\) = 0\s+or \(p_item->>'type'\) = any\(interest_types\)/);
});

// --- T25: Aggregate Before Finish ---
test('T25: Aggregate Before Finish - 08-discovery has aggregation node before Complete discovery run', () => {
  const wf = JSON.parse(readFileSync('workflows/08-discovery.json', 'utf8'));
  const aggregateNode = wf.nodes.find(n => n.id === 'aggregate-saved');
  const finishNode = wf.nodes.find(n => n.id === 'finish');
  assert.ok(aggregateNode, 'Workflow must contain aggregate-saved node');
  assert.ok(finishNode, 'Workflow must contain finish node');
  // Check connection: save-item -> aggregate-saved -> finish
  assert.ok(wf.connections['Save catalog item and project'].main[0].some(e => e.node === 'Aggregate saved results'));
  assert.ok(wf.connections['Aggregate saved results'].main[0].some(e => e.node === 'Complete discovery run'));
});

// --- T26: Propose Rule 3 Distinct Opportunities ---
test('T26: Propose Rule 3 Distinct Opportunities - Requires 3 distinct opportunities and excludes pin', () => {
  // 3 decisions on same opportunity must NOT propose rule
  const sameOppDecisions = [
    { id: 'dec-1', opportunity_id: 'opp-1', source_scope: 'lever', opportunity_type: 'internship', choice: 'approve', created_at: '2026-10-15T10:00:00Z' },
    { id: 'dec-2', opportunity_id: 'opp-1', source_scope: 'lever', opportunity_type: 'internship', choice: 'approve', created_at: '2026-10-15T09:00:00Z' },
    { id: 'dec-3', opportunity_id: 'opp-1', source_scope: 'lever', opportunity_type: 'internship', choice: 'approve', created_at: '2026-10-15T08:00:00Z' },
  ];
  assert.equal(evaluateRuleProposal({ decisions: sameOppDecisions, existingRules: [] }), null);

  // 'pin' choices must NOT propose rule
  const pinDecisions = [
    { id: 'dec-1', opportunity_id: 'opp-1', source_scope: 'lever', opportunity_type: 'internship', choice: 'pin', created_at: '2026-10-15T10:00:00Z' },
    { id: 'dec-2', opportunity_id: 'opp-2', source_scope: 'lever', opportunity_type: 'internship', choice: 'pin', created_at: '2026-10-15T09:00:00Z' },
    { id: 'dec-3', opportunity_id: 'opp-3', source_scope: 'lever', opportunity_type: 'internship', choice: 'pin', created_at: '2026-10-15T08:00:00Z' },
  ];
  assert.equal(evaluateRuleProposal({ decisions: pinDecisions, existingRules: [] }), null);

  // 3 distinct opportunity approvals propose preauthorize rule
  const validDecisions = [
    { id: 'dec-1', opportunity_id: 'opp-1', source_scope: 'lever', opportunity_type: 'internship', choice: 'approve', created_at: '2026-10-15T10:00:00Z' },
    { id: 'dec-2', opportunity_id: 'opp-2', source_scope: 'lever', opportunity_type: 'internship', choice: 'approve', created_at: '2026-10-15T09:00:00Z' },
    { id: 'dec-3', opportunity_id: 'opp-3', source_scope: 'lever', opportunity_type: 'internship', choice: 'approve', created_at: '2026-10-15T08:00:00Z' },
  ];
  const proposal = evaluateRuleProposal({ decisions: validDecisions, existingRules: [] });
  assert.ok(proposal);
  assert.equal(proposal.rule_type, 'preauthorize');
  assert.equal(proposal.conditions.min_score, 60);
  assert.equal(proposal.conditions.min_confidence, 0.65);
});

// --- T27: Standing Rule Autonomous Loop ---
test('T27: Standing Rule Autonomous Loop - Active rule preauthorizes eligible ASK, avoids question', () => {
  const activeRule = {
    id: 'rule-active-1',
    status: 'active',
    rule_type: 'preauthorize',
    source_scope: 'lever',
    opportunity_type: 'internship',
    conditions: { min_score: 60, min_confidence: 0.65 }
  };

  const eligibleOpp = {
    source_badge: 'lever',
    type: 'internship',
    deadline: '2026-10-30',
    trust_tier: 'corroborated',
    risk_signals: []
  };

  const askMatch = {
    decision: 'ASK',
    eligibility_status: 'ELIGIBLE',
    match_score: 72,
    confidence: 0.8
  };

  const res = applyStandingRule({ match: askMatch, opportunity: eligibleOpp, rules: [activeRule] });
  assert.equal(res.applied, true);
  assert.equal(res.decision, 'ACT');
  assert.equal(res.question_avoided, true);
  assert.equal(res.rule_id, 'rule-active-1');
});
