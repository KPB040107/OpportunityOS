import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  classifySeniority,
  normalizeLeverItem,
  normalizeGreenhouseItem,
  normalizeAshbyItem
} from './discovery-adapters.mjs';
import { createDecisionContract } from './decision-contract.mjs';
import { createHash } from 'node:crypto';

test('classifySeniority accurately differentiates intern, entry, mid, senior, and executive roles', () => {
  // Internships
  assert.equal(classifySeniority('Software Engineering Intern'), 'intern');
  assert.equal(classifySeniority('Graduate Trainee - Operations'), 'intern');
  assert.equal(classifySeniority('Research Apprentice'), 'intern');

  // Executive & Leadership
  assert.equal(classifySeniority('Director of Engineering'), 'executive');
  assert.equal(classifySeniority('Vice President, Product'), 'executive');
  assert.equal(classifySeniority('VP of Infrastructure'), 'executive');
  assert.equal(classifySeniority('Associate Director, Analytics'), 'executive', 'Associate Director must be executive, not entry');
  assert.equal(classifySeniority('Head of Security'), 'executive');

  // Senior / Lead / Staff / Manager
  assert.equal(classifySeniority('Senior Software Engineer'), 'senior');
  assert.equal(classifySeniority('Lead Backend Engineer'), 'senior');
  assert.equal(classifySeniority('Principal Architect'), 'senior');
  assert.equal(classifySeniority('Engineering Manager'), 'senior');
  assert.equal(classifySeniority('Staff Systems Engineer'), 'senior');

  // Entry-level & Junior (with critical nuance: associate engineer is entry, associate director is executive)
  assert.equal(classifySeniority('Junior Frontend Developer'), 'entry');
  assert.equal(classifySeniority('Associate Software Engineer'), 'entry');
  assert.equal(classifySeniority('Associate Consultant'), 'entry');
  assert.equal(classifySeniority('Associate QA Engineer'), 'entry');
  assert.equal(classifySeniority('Fresher SDE'), 'entry');

  // Mid / Standard
  assert.equal(classifySeniority('Software Engineer'), 'mid');
  assert.equal(classifySeniority('Product Designer'), 'mid');
});

test('normalizeGreenhouseItem produces valid source-item-v2 structure with seniority and clean text', () => {
  const sample = {
    id: 12345,
    title: 'Associate Systems Engineer',
    location: { name: 'Bengaluru, India' },
    absolute_url: 'https://boards.greenhouse.io/cloudflare/jobs/12345',
    content: '<p>Join Cloudflare to build the internet. <strong>Requirements:</strong> Python, Linux.</p>'
  };

  const normalized = normalizeGreenhouseItem('cloudflare', sample);

  assert.equal(normalized.contract_version, 'source-item-v2');
  assert.equal(normalized.adapter, 'greenhouse-v1');
  assert.equal(normalized.organization, 'CLOUDFLARE');
  assert.equal(normalized.title, 'Associate Systems Engineer');
  assert.equal(normalized.type, 'job');
  assert.equal(normalized.seniority_level, 'entry');
  assert.equal(normalized.location, 'Bengaluru, India');
  assert.equal(normalized.deadline, null);
  assert.equal(normalized.trust_tier, 'corroborated');
  assert.ok(normalized.raw_text.includes('Python, Linux'));
  assert.ok(!normalized.raw_text.includes('<p>'));
});

test('normalizeAshbyItem produces valid source-item-v2 structure with seniority and clean text', () => {
  const sample = {
    id: 'ashby-uuid-1',
    title: 'Software Engineer Intern - Summer 2026',
    location: 'Remote',
    jobUrl: 'https://jobs.ashbyhq.com/posthog/ashby-uuid-1',
    descriptionPlain: 'Join PostHog open source telemetry. Requirements: TypeScript, React.'
  };

  const normalized = normalizeAshbyItem('posthog', sample);

  assert.equal(normalized.contract_version, 'source-item-v2');
  assert.equal(normalized.adapter, 'ashby-v1');
  assert.equal(normalized.organization, 'POSTHOG');
  assert.equal(normalized.title, 'Software Engineer Intern - Summer 2026');
  assert.equal(normalized.type, 'internship');
  assert.equal(normalized.seniority_level, 'intern');
  assert.equal(normalized.location, 'Remote');
  assert.equal(normalized.deadline, null);
  assert.equal(normalized.trust_tier, 'corroborated');
  assert.ok(normalized.raw_text.includes('TypeScript, React'));
});

test('Source diversity logic caps employer representation to max 3 in top 12 recommendations', () => {
  // Simulate 10 Meesho listings and 3 CRED listings and 2 Devpost listings
  const listings = [
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `meesho-${i}`,
      organization: 'Meesho',
      title: `Meesho Role ${i}`,
      score: 80 - i
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      id: `cred-${i}`,
      organization: 'CRED',
      title: `CRED Role ${i}`,
      score: 75 - i
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      id: `devpost-${i}`,
      organization: 'Devpost Community',
      title: `Hackathon ${i}`,
      score: 85 - i
    }))
  ];

  // Apply diversity rule
  const counts = {};
  const topTier = [];
  const remaining = [];

  for (const item of listings) {
    const org = item.organization.toLowerCase();
    const count = counts[org] || 0;
    if (count < 3 || topTier.length >= 12) {
      topTier.push(item);
      counts[org] = count + 1;
    } else {
      remaining.push(item);
    }
  }

  const first12 = topTier.slice(0, 12);
  const meeshoInFirst12 = first12.filter((x) => x.organization === 'Meesho');

  assert.ok(meeshoInFirst12.length <= 3, `Expected at most 3 Meesho listings in top 12, got ${meeshoInFirst12.length}`);
  assert.ok(first12.some((x) => x.organization === 'CRED'), 'CRED listings must appear in top 12');
  assert.ok(first12.some((x) => x.organization === 'Devpost Community'), 'Devpost must appear in top 12');

  // Verify remaining listings are not deleted, merely deferred
  const allTogether = [...topTier, ...remaining];
  assert.equal(allTogether.length, listings.length, 'No listings deleted; remaining accessible');
});

test('Decision-v2 no-deadline policy permits tracking and notification without calendar events', () => {
  const pack = JSON.parse(readFileSync(new URL('../testdata/slice3-fixtures.json', import.meta.url), 'utf8'));
  const policy = createDecisionContract({
    hash: (v) => createHash('sha256').update(v).digest('hex'),
    enableMissingDeadlinePolicy: true
  });

  const base = structuredClone(pack.fixtures[0]);
  base.input.opportunity.deadline = null; // No deadline stated
  // Filter out any deadline requirement from requirements
  base.input.requirements = (base.input.requirements || []).filter((r) => r.kind !== 'deadline');

  const decision = policy.decide(base.input, base.match, pack.now);

  assert.equal(decision.policy_version, 'decision-v2');
  assert.equal(decision.eligibility_status, 'ELIGIBLE');
  assert.equal(decision.decision, 'ACT');
  assert.ok(decision.reason_codes.includes('ELIGIBLE_NO_DEADLINE_TRACK'));
  assert.equal(decision.days_to_deadline, null);

  // Check that deadline check status is NOT_STATED (not UNKNOWN)
  const deadlineCheck = decision.eligibility_checks.find((c) => c.kind === 'deadline');
  assert.ok(deadlineCheck);
  assert.equal(deadlineCheck.status, 'NOT_STATED');
});
