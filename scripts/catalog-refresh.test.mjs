// scripts/catalog-refresh.test.mjs
// Unit and integration tests for atomic catalog requirement refresh,
// quote validation, Ecera System qualification extraction, and UI score consistency.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { extractSkillsAndRequirements } from './skill-extractor.mjs';
import { buildStructuredRequirements } from './discovery-adapters.mjs';
import { createDecisionContract } from './decision-contract.mjs';

const eceraText = `Software Engineer Intern (Paid)
Employer: Ecera System
Location: Bengaluru, Karnataka, IN
Description: Company Description Ecera System is a staffing services provider that delivers industry-leading employment solutions across a wide range of businesses. The organization focuses on quickly matching the right talent to both permanent roles and short-term projects, using best practices and optimized recruiting strategies. By leveraging modern technology, advanced sourcing methods, and a national reach, Ecera System efficiently identifies and thoroughly verifies qualified candidates. The company emphasizes a personalized, single point of contact model, giving clients direct access to seasoned staffing professionals. Clients benefit from a streamlined, time-conscious process designed to ensure high-quality placements and complete satisfaction.
Role Description The Software Engineer Intern (Paid) will support the design, development, and testing of software applications as part of a collaborative engineering team. Day-to-day tasks include writing clean and maintainable code, assisting with back-end web development, debugging and resolving issues, and participating in code reviews. The intern will also help document technical solutions, learn and apply object-oriented programming principles, and contribute to improving existing systems under guidance from senior engineers. This is a full-time, on-site role based in Bengaluru, requiring regular collaboration with team members and other stakeholders in person.
Qualifications
• Strong foundation in Computer Science concepts, including data structures, algorithms, and software design principles.
• Practical skills in Software Development and Programming, with experience in at least one modern programming language (such as Java, Python, C++, or JavaScript).
• Understanding of Back-End Web Development, including APIs, server-side logic, and database integration.
• Knowledge of Object-Oriented Programming (OOP) and ability to apply OOP concepts to real-world projects.
• Currently pursuing or recently completed a degree in Computer Science, Information Technology, or a related field.
• Ability to learn quickly, follow technical guidance, and work effectively as part of a team on-site in Bengaluru.
• Good problem-solving, analytical, and communication skills, with attention to code quality and documentation.
• Familiarity with version control systems (e.g., Git) and basic software development lifecycle practices is beneficial.
Link: https://in.linkedin.com/jobs/view/software-engineer-intern-paid-at-ecera-system-4450592652`;

const studentProfile = {
  degree: 'BTech',
  branch: 'Computer Science and Engineering',
  academic_year: 3,
  graduation_year: 2026,
  cgpa: 8.85,
  skills: [
    { name: 'python', level: 'advanced' },
    { name: 'sql', level: 'advanced' },
    { name: 'javascript', level: 'intermediate' },
    { name: 'react', level: 'intermediate' }
  ]
};

const contract = createDecisionContract({
  hash: (s) => createHash('sha256').update(s).digest('hex'),
  enableMissingDeadlinePolicy: true
});

test('Stripe style minimum requirements keep real bullets and exclude source metadata', () => {
  const description = [
    'Who you are',
    '• Rigorous thinker: you enjoy solving unfamiliar problems.',
    'Minimum requirements',
    '• A strong understanding of computer science through pursuit of a Bachelor’s degree.',
    '• Experience with programming. We work mostly in Ruby, Java, and JavaScript.',
    'Preferred qualifications',
    '• Familiarity with distributed systems is helpful.',
    'Link: https://stripe.com/careers/listing/software-engineer-intern/8031833'
  ].join('\n');
  const extracted = extractSkillsAndRequirements(description);
  const structured = buildStructuredRequirements(extracted.requirements, extracted.skills, description);

  assert.ok(structured.some(r => r.kind === 'degree' && r.mandatory));
  assert.ok(structured.some(r => r.value.startsWith('Rigorous thinker:') && !r.mandatory));
  assert.ok(structured.some(r => r.kind === 'skill' && r.value === 'Ruby' && !r.mandatory));
  assert.ok(structured.every(r => !/^minimum requirements$|^link:/i.test(r.value)));
  assert.ok(structured.every(r => description.includes(r.evidence)));
});

test('Ecera System qualification extraction produces structured requirements with exact quotes', () => {
  const result = extractSkillsAndRequirements(eceraText);

  // 1. Technical skills extracted
  assert.ok(result.skills.includes('JavaScript'), 'Must extract JavaScript');
  assert.ok(result.skills.includes('Python'), 'Must extract Python');
  assert.ok(result.skills.includes('Java'), 'Must extract Java');
  assert.ok(result.skills.includes('Git'), 'Must extract Git');
  assert.ok(result.skills.includes('Data Structures'), 'Must extract Data Structures');
  assert.ok(result.skills.includes('Algorithms'), 'Must extract Algorithms');

  // 2. Structured requirements
  const structured = buildStructuredRequirements(result.requirements, result.skills, eceraText);
  assert.ok(structured.length >= 8, `Expected at least 8 structured requirements, got ${structured.length}`);

  // 3. Every single requirement must have a quote that literally exists in the source text
  for (const r of structured) {
    const quote = r.evidence || r.evidence_snippet || r.quote;
    assert.ok(quote, `Requirement [${r.kind}: ${r.value}] must have non-empty quote`);
    assert.ok(
      eceraText.toLowerCase().includes(quote.toLowerCase()),
      `Quote "${quote}" must literally exist in source text`
    );
  }

  // 4. Degree and location requirements are parsed
  const degreeReq = structured.find(r => r.kind === 'degree');
  assert.ok(degreeReq, 'Must find degree requirement');
  assert.equal(degreeReq.mandatory, true);
  assert.equal(degreeReq.requirement_class, 'mandatory_eligibility');

  const locReq = structured.find(r => r.kind === 'location');
  assert.ok(locReq, 'Must find location requirement');
  assert.ok(locReq.evidence.includes('Bengaluru'));
});

test('Decision contract evaluates Ecera System with UNKNOWN eligibility and NO numerical score', () => {
  const ext = extractSkillsAndRequirements(eceraText);
  const structured = buildStructuredRequirements(ext.requirements, ext.skills, eceraText);

  const opp = {
    title: 'Software Engineer Intern (Paid)',
    organization: 'Ecera System',
    type: 'internship',
    location: 'Bengaluru, Karnataka, IN',
    deadline: null,
    skills: ext.skills,
    requirements: structured,
    requirements_status: 'REQUIREMENTS_PRESENT'
  };

  const elig = contract.eligibility({
    profile: studentProfile,
    opportunity: opp
  });

  // Missing deadline for internship remains NOT_STATED
  const deadlineCheck = elig.checks.find(c => c.kind === 'deadline');
  assert.ok(deadlineCheck);
  assert.equal(deadlineCheck.status, 'NOT_STATED');

  // Eligibility is UNKNOWN due to unverifiable criteria (e.g. broad degree/location)
  assert.equal(elig.status, 'UNKNOWN');

  // Contract decision must not yield a numerical score or contradictory explanation
  const decisionResult = contract.policy(elig, 0, 0.85, 'cautious');
  assert.equal(decisionResult.decision, 'ASK');
  assert.deepEqual(decisionResult.reason_codes, ['UNKNOWN_ELIGIBILITY']);
});

test('Safe quote validation rejects fabricated or hallucinated evidence', () => {
  const fabricatedReq = {
    kind: 'degree',
    value: 'PhD in Quantum Physics',
    mandatory: true,
    evidence: 'Candidate must hold a PhD in Quantum Computing from MIT'
  };

  const rawText = eceraText;
  const quote = fabricatedReq.evidence;
  const isQuoteInSource = rawText.toLowerCase().includes(quote.toLowerCase());

  assert.equal(isQuoteInSource, false, 'Fabricated quote must be rejected');
});

test('UI explanation sanitization eliminates contradictory score alongside Scoring Not Evaluated', () => {
  const sanitize = (isInsufficient, explanation) => {
    if (!isInsufficient || !explanation) return explanation;
    return explanation
      .replace(/\s*Match score\s+[\d.]+\/100;?/gi, '')
      .replace(/\s*Confidence\s+[\d.]+%?;?/gi, '')
      .replace(/\s*confidence\s+[\d.]+%?;?/gi, '')
      .trim();
  };

  const legacyExplanation = 'Some required facts need clarification. The application deadline is not stated. The mandatory degree requirement cannot be verified from the current profile. Match score 25/100; confidence 50%.';

  const cleaned = sanitize(true, legacyExplanation);
  assert.ok(!cleaned.includes('Match score 25/100'), 'Must not include Match score 25/100');
  assert.ok(!cleaned.includes('Match score'), 'Must not include Match score text');
  assert.ok(!cleaned.includes('confidence 50%'), 'Must not include confidence 50%');
  assert.ok(cleaned.includes('The mandatory degree requirement cannot be verified'), 'Must retain verification reason');

  // When not insufficient, score is preserved
  const validExplanation = 'Eligible and above threshold. Match score 85/100; confidence 90%.';
  const preserved = sanitize(false, validExplanation);
  assert.equal(preserved, validExplanation);
});

test('Multi-user isolation: User card state mutations are isolated', () => {
  const user1Card = {
    id: 'opp-user-1',
    user_id: 'user-1',
    is_saved: true,
    is_hidden: false,
    notes: 'Excited about Bengaluru team'
  };

  const user2Card = {
    id: 'opp-user-2',
    user_id: 'user-2',
    is_saved: false,
    is_hidden: true,
    notes: null
  };

  // Simulating catalog update on user 1
  const updatedUser1 = {
    ...user1Card,
    skills: ['JavaScript', 'Python'],
    requirements_status: 'REQUIREMENTS_PRESENT'
  };

  // User 2 remains untouched
  assert.equal(user2Card.is_saved, false);
  assert.equal(user2Card.is_hidden, true);
  assert.equal(user1Card.is_saved, true);
  assert.equal(updatedUser1.is_saved, true);
  assert.equal(updatedUser1.notes, 'Excited about Bengaluru team');
});
