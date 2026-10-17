import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePdfBuffer,
  sanitizeResumeText,
  validateProfileDraft,
  reconcileDraftWithProfile,
  validateConfirmationPayload,
  extractDraftFromText,
  MAX_PDF_BYTES,
  RESUME_CONTRACT_VERSION,
} from './resume-contract.mjs';

test('validatePdfBuffer: enforces PDF magic header and size limit', () => {
  assert.throws(() => validatePdfBuffer(null), /PDF_EMPTY/);
  assert.throws(() => validatePdfBuffer(Buffer.from('')), /PDF_EMPTY/);

  // Non-PDF
  const fakeDoc = Buffer.from('NOT A PDF FILE');
  assert.throws(() => validatePdfBuffer(fakeDoc), /INVALID_PDF_SIGNATURE/);

  // Oversized PDF
  const largeHeader = Buffer.from('%PDF-1.7\n');
  const oversized = Buffer.alloc(MAX_PDF_BYTES + 10);
  largeHeader.copy(oversized);
  assert.throws(() => validatePdfBuffer(oversized), /PDF_TOO_LARGE/);

  // Valid minimal PDF
  const valid = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
  const res = validatePdfBuffer(valid);
  assert.equal(res.valid, true);
});

test('validatePdfBuffer: rejects encrypted and executable/malicious PDFs', () => {
  // Encrypted PDF
  const encryptedPdf = Buffer.from('%PDF-1.5\n/Encrypt 12 0 R\n%%EOF');
  assert.throws(() => validatePdfBuffer(encryptedPdf), /ENCRYPTED_PDF_REJECTED/);

  // Embedded JS PDF
  const jsPdf = Buffer.from('%PDF-1.5\n/Names << /JavaScript 5 0 R >>\n%%EOF');
  assert.throws(() => validatePdfBuffer(jsPdf), /PDF_CONTAINS_EXECUTABLE_CODE/);

  // Launch action PDF
  const launchPdf = Buffer.from('%PDF-1.5\n/Launch << /F (malicious.exe) >>\n%%EOF');
  assert.throws(() => validatePdfBuffer(launchPdf), /PDF_CONTAINS_EXECUTABLE_CODE/);
});

test('sanitizeResumeText: strips control characters and enforces length bound', () => {
  const dirty = 'Hello\x00World\x08Test\r\nLine 2';
  const clean = sanitizeResumeText(dirty);
  assert.equal(clean, 'Hello World Test\nLine 2');

  const huge = 'A'.repeat(30000);
  assert.equal(sanitizeResumeText(huge).length, 20000);
});

test('extractDraftFromText: extracts degree, graduation year, skills with quotes and keeps skill level null', () => {
  const resumeSample = `
    Alex Sharma
    Education: B.Tech in Computer Science and Engineering
    Graduation: Batch of 2026
    CGPA: 8.85 / 10
    Technical Skills: Python, TypeScript, React, PostgreSQL, Docker, Git
  `;

  const draft = extractDraftFromText(resumeSample, 1, 2);
  assert.equal(draft.contract_version, RESUME_CONTRACT_VERSION);
  assert.equal(draft.base_profile_revision, 2);

  const degreeField = draft.fields.find((f) => f.field === 'degree');
  assert.ok(degreeField);
  assert.equal(degreeField.value, 'BTech');
  assert.equal(degreeField.evidence.page, 1);
  assert.ok(degreeField.evidence.quote.includes('B.Tech'));

  const cgpaField = draft.fields.find((f) => f.field === 'cgpa');
  assert.ok(cgpaField);
  assert.equal(cgpaField.value, 8.85);
  assert.equal(cgpaField.state, 'proposed');

  // Skill levels MUST be strictly null (never inferred by code/AI)
  assert.ok(draft.skills.length >= 4);
  for (const s of draft.skills) {
    assert.equal(s.level, null, `Skill ${s.name} must have null level`);
    assert.equal(s.state, 'needs_confirmation');
    assert.ok(s.evidence.quote);
  }

  // Verify validateProfileDraft passes this
  assert.doesNotThrow(() => validateProfileDraft(draft));
});

test('extractDraftFromText: detects 4.0 scale CGPA and flags needs_clarification (no silent conversion)', () => {
  const resumeSample = `
    Rohan Verma
    Degree: BCA
    GPA: 3.75 / 4.0
    Skills: JavaScript, Node.js
  `;

  const draft = extractDraftFromText(resumeSample, 1, 0);
  const cgpaField = draft.fields.find((f) => f.field === 'cgpa');
  assert.ok(cgpaField);
  assert.equal(cgpaField.value, 3.75);
  assert.equal(cgpaField.state, 'needs_clarification');

  const scaleField = draft.fields.find((f) => f.field === 'cgpa_scale');
  assert.ok(scaleField);
  assert.equal(scaleField.value, '4.0');
  assert.equal(scaleField.state, 'needs_clarification');
});

test('reconcileDraftWithProfile: accurately identifies new fields, existing values, conflicts, and skill overlaps', () => {
  const existingProfile = {
    revision: 3,
    degree: 'B.Tech',
    branch: null,
    cgpa: 7.5,
    skills: [
      { skill: 'python', experience_level: 'intermediate' },
    ],
  };

  const draft = {
    contract_version: RESUME_CONTRACT_VERSION,
    base_profile_revision: 3,
    fields: [
      { field: 'degree', value: 'BTech', state: 'proposed', evidence: { page: 1, quote: 'B.Tech' } },
      { field: 'branch', value: 'Data Science', state: 'proposed', evidence: { page: 1, quote: 'Data Science' } },
      { field: 'cgpa', value: 8.5, state: 'proposed', evidence: { page: 1, quote: '8.5' } },
    ],
    skills: [
      { name: 'Python', level: null, state: 'needs_confirmation', evidence: { page: 1, quote: 'Python' } },
      { name: 'Docker', level: null, state: 'needs_confirmation', evidence: { page: 1, quote: 'Docker' } },
    ],
    missing_fields: ['academic_year'],
  };

  const reconciled = reconcileDraftWithProfile(existingProfile, draft);
  assert.equal(reconciled.baseRevision, 3);

  const degreeComp = reconciled.fields.find((f) => f.field === 'degree');
  assert.equal(degreeComp.isNew, false);

  const branchComp = reconciled.fields.find((f) => f.field === 'branch');
  assert.equal(branchComp.isNew, true);
  assert.equal(branchComp.hasConflict, false);

  const cgpaComp = reconciled.fields.find((f) => f.field === 'cgpa');
  assert.equal(cgpaComp.hasConflict, true);
  assert.equal(cgpaComp.existingValue, 7.5);
  assert.equal(cgpaComp.proposedValue, 8.5);

  const pySkill = reconciled.skills.find((s) => s.name === 'Python');
  assert.equal(pySkill.alreadyExists, true);

  const dockerSkill = reconciled.skills.find((s) => s.name === 'Docker');
  assert.equal(dockerSkill.alreadyExists, false);
});

test('validateConfirmationPayload: requires valid revision, explicit skill levels, and valid CGPA', () => {
  // Missing draft id
  assert.throws(() => validateConfirmationPayload({}), /MISSING_DRAFT_ID/);

  // Missing expected revision
  assert.throws(() => validateConfirmationPayload({ draft_id: 'draft-123' }), /MISSING_EXPECTED_REVISION/);

  // Invalid CGPA > 10
  assert.throws(() => validateConfirmationPayload({
    draft_id: 'draft-123',
    expected_revision: 1,
    selected_fields: { cgpa: 15.0 },
    skills_with_levels: [],
  }), /INVALID_CGPA/);

  // Missing or invalid skill level
  assert.throws(() => validateConfirmationPayload({
    draft_id: 'draft-123',
    expected_revision: 1,
    selected_fields: { degree: 'B.Tech' },
    skills_with_levels: [{ name: 'React', level: 'expert' }], // 'expert' is invalid
  }), /INVALID_SKILL_LEVEL/);

  // Valid confirmation
  assert.ok(validateConfirmationPayload({
    draft_id: 'draft-123',
    expected_revision: 1,
    selected_fields: { degree: 'B.Tech', cgpa: 8.5 },
    skills_with_levels: [
      { name: 'React', level: 'intermediate' },
      { name: 'Docker', level: 'beginner' },
    ],
  }));
});

test('extractDraftFromText: extracts projects with title, description, technologies, github link, and evidence', () => {
  const resumeWithProjects = `
    Priya Nair
    Education: B.Tech in Information Technology
    Graduation: 2025
    Technical Skills: React, Node.js, PostgreSQL, Docker, Python

    Projects:
    DevPulse - Developer Activity Tracker | https://github.com/priya/devpulse
    Built a comprehensive real-time dashboard tracking GitHub PRs and developer throughput.
    Tech: React, Node.js, PostgreSQL

    CampusMart (Jan 2024 - Apr 2024)
    Developed a peer-to-peer campus marketplace app for textbook sharing.
    https://github.com/priya/campus-mart
    Built with: Python, Docker
  `;

  const draft = extractDraftFromText(resumeWithProjects, 1, 1);
  assert.ok(draft.projects);
  assert.equal(draft.projects.length, 2);

  const devPulse = draft.projects.find((p) => p.title.includes('DevPulse'));
  assert.ok(devPulse, 'DevPulse project should be extracted');
  assert.equal(devPulse.github_url, 'https://github.com/priya/devpulse');
  assert.ok(devPulse.technologies.includes('React'));
  assert.ok(devPulse.technologies.includes('Node.js'));
  assert.ok(devPulse.technologies.includes('PostgreSQL'));
  assert.ok(devPulse.description.includes('real-time dashboard'));
  assert.equal(devPulse.evidence.page, 1);
  assert.ok(devPulse.evidence.quote.includes('DevPulse'));

  const campusMart = draft.projects.find((p) => p.title.includes('CampusMart'));
  assert.ok(campusMart, 'CampusMart project should be extracted');
  assert.equal(campusMart.github_url, 'https://github.com/priya/campus-mart');
  assert.ok(campusMart.dates.includes('2024'));
  assert.ok(campusMart.technologies.includes('Python'));
  assert.ok(campusMart.technologies.includes('Docker'));

  assert.doesNotThrow(() => validateProfileDraft(draft));
});

test('extractDraftFromText: separates PDF projects when blank lines are collapsed', () => {
  const flattenedPdfText = `Projects:
OpportunityOS
https://github.com/KPB040107/OpportunityOS
Built an opportunity tracker.
Tech: Next.js, TypeScript
ResumeShortlist
https://github.com/KPB040107/resumeshortlist
Built a resume ranking app.
Tech: Python, Streamlit
Technical Skills
Python, TypeScript`;

  const draft = extractDraftFromText(flattenedPdfText, 1, 0);
  assert.deepEqual(draft.projects.map((project) => [project.title, project.github_url]), [
    ['OpportunityOS', 'https://github.com/KPB040107/OpportunityOS'],
    ['ResumeShortlist', 'https://github.com/KPB040107/resumeshortlist'],
  ]);
});

test('extractDraftFromText: suggests skill levels with evidence and confidence from repeated use, project context, duration, and self-description', () => {
  const richResume = `
    Kavya Patel
    Education: B.E. in Computer Engineering, Class of 2024
    Total work experience: 2.5 years professional experience

    Skills:
    Python (advanced), 3+ years experience with React, basic Rust, Docker

    Projects:
    CodeReviewAI | https://github.com/kavya/code-review-ai
    Full-stack developer tool built using Python and Docker for automated code reviews.

    TelemetryHub | https://github.com/kavya/telemetry-hub
    High throughput metrics service built with Docker and Python microservices.
  `;

  const draft = extractDraftFromText(richResume, 2, 0);

  // Python: self-described advanced and used in 2 projects
  const pythonSkill = draft.skills.find((s) => s.name === 'Python');
  assert.ok(pythonSkill);
  assert.equal(pythonSkill.level, 'advanced');
  assert.ok(pythonSkill.confidence >= 0.85);
  assert.ok(pythonSkill.evidence.quote.toLowerCase().includes('python'));

  // React: 3+ years duration -> advanced
  const reactSkill = draft.skills.find((s) => s.name === 'React');
  assert.ok(reactSkill);
  assert.equal(reactSkill.level, 'advanced');
  assert.ok(reactSkill.confidence >= 0.80);
  assert.ok(reactSkill.evidence.quote.includes('3+ years'));

  // Rust: self-described basic -> beginner
  const rustSkill = draft.skills.find((s) => s.name === 'Rust');
  assert.ok(rustSkill);
  assert.equal(rustSkill.level, 'beginner');
  assert.ok(rustSkill.confidence >= 0.80);

  // Docker: used across 2 projects -> intermediate suggested
  const dockerSkill = draft.skills.find((s) => s.name === 'Docker');
  assert.ok(dockerSkill);
  assert.equal(dockerSkill.level, 'intermediate');
  assert.ok(dockerSkill.confidence >= 0.70);

  // Years of professional experience extracted separately (not by counting projects)
  assert.equal(draft.years_of_experience, 2.5);
  const expField = draft.fields.find((f) => f.field === 'years_of_experience');
  assert.ok(expField);
  assert.equal(expField.value, 2.5);
  assert.ok(expField.evidence.quote.includes('2.5 years'));
});

test('extractDraftFromText: does not calculate experience by counting projects', () => {
  const threeProjectsNoExp = `
    Student Developer
    Degree: B.Tech
    Graduation: 2026
    Skills: JavaScript, HTML, CSS

    Projects:
    Project One | https://github.com/student/one
    A simple web game built with JavaScript.

    Project Two | https://github.com/student/two
    A weather tracker application.

    Project Three | https://github.com/student/three
    A personal portfolio blog.
  `;

  const draft = extractDraftFromText(threeProjectsNoExp, 1, 0);
  assert.equal(draft.projects.length, 3);
  // Must NOT infer 3 years from 3 projects
  assert.equal(draft.years_of_experience, null);
  const expField = draft.fields.find((f) => f.field === 'years_of_experience');
  assert.equal(expField, undefined);
});

test('reconcileDraftWithProfile: reconciles projects and suggested skill levels with existing profile', () => {
  const existingProfile = {
    revision: 2,
    projects: [
      { title: 'DevPulse', source: 'manual' },
    ],
    skills: [
      { name: 'Python', level: 'intermediate' },
    ],
  };

  const draft = {
    contract_version: RESUME_CONTRACT_VERSION,
    base_profile_revision: 2,
    fields: [
      { field: 'years_of_experience', value: 2, state: 'proposed', evidence: { page: 1, quote: '2 years' } },
    ],
    skills: [
      { name: 'Python', level: 'advanced', suggested_level: 'advanced', confidence: 0.9, evidence: { page: 1, quote: 'Python (advanced)' }, state: 'needs_confirmation' },
      { name: 'Docker', level: 'intermediate', suggested_level: 'intermediate', confidence: 0.8, evidence: { page: 1, quote: 'Docker' }, state: 'needs_confirmation' },
    ],
    projects: [
      { title: 'DevPulse', description: 'Activity tracker', technologies: ['React'], github_url: 'https://github.com/p/devpulse', dates: null, evidence: { page: 1, quote: 'DevPulse' } },
      { title: 'NewService', description: 'Backend service', technologies: ['Go'], github_url: null, dates: null, evidence: { page: 1, quote: 'NewService' } },
    ],
    missing_fields: [],
  };

  const reconciled = reconcileDraftWithProfile(existingProfile, draft);

  // Projects reconciliation
  assert.equal(reconciled.projects.length, 2);
  const existingProj = reconciled.projects.find((p) => p.title === 'DevPulse');
  assert.equal(existingProj.alreadyExists, true);
  assert.equal(existingProj.state, 'already_in_profile');

  const newProj = reconciled.projects.find((p) => p.title === 'NewService');
  assert.equal(newProj.alreadyExists, false);
  assert.equal(newProj.state, 'proposed');

  // Skills reconciliation with suggested levels
  const pySkill = reconciled.skills.find((s) => s.name === 'Python');
  assert.equal(pySkill.alreadyExists, true);
  assert.equal(pySkill.suggestedLevel, 'advanced');
  assert.equal(pySkill.confidence, 0.9);

  const dockerSkill = reconciled.skills.find((s) => s.name === 'Docker');
  assert.equal(dockerSkill.alreadyExists, false);
  assert.equal(dockerSkill.suggestedLevel, 'intermediate');
});

test('validateConfirmationPayload: supports proposed projects, consents, and years of experience', () => {
  const validPayload = {
    draft_id: 'draft-456',
    expected_revision: 2,
    selected_fields: {
      degree: 'B.Tech',
      years_of_experience: 2,
    },
    skills_with_levels: [
      { name: 'Python', level: 'advanced' },
      { name: 'Docker', level: 'intermediate' },
    ],
    projects: [
      {
        title: 'DevPulse',
        description: 'Developer dashboard',
        technologies: ['React', 'Node.js'],
        github_url: 'https://github.com/priya/devpulse',
        dates: '2024',
        source: 'resume',
      },
    ],
    consents: {
      email_notifications_enabled: true,
      calendar_sync_enabled: false,
    },
  };

  assert.ok(validateConfirmationPayload(validPayload));

  // Invalid github URL
  assert.throws(() => validateConfirmationPayload({
    ...validPayload,
    projects: [{ title: 'Bad Project', github_url: 'https://gitlab.com/bad/project' }],
  }), /INVALID_GITHUB_URL/);

  // Invalid experience years
  assert.throws(() => validateConfirmationPayload({
    ...validPayload,
    selected_fields: { years_of_experience: -5 },
  }), /INVALID_EXPERIENCE_YEARS/);
});

test('extractDraftFromText: extracts 4 to 5 projects from resumes without double blank lines', () => {
  const multiProjectResume = `
    Kaustubh Borle
    Education: B.Tech in Computer Science and Engineering
    Graduation: 2026

    Technical Skills: Python, TypeScript, React, Next.js, Node.js, Go, Docker, PostgreSQL, MySQL, Redis

    Projects:
    OpportunityOS - Student Opportunity Platform 2026
    https://github.com/KPB040107/OpportunityOS
    Tech: Next.js, React, TypeScript, Supabase PostgreSQL, n8n, Docker
    - Built an autonomous opportunity crawler and decision engine for students.
    - Implemented approval gates, deadline tracking, and profile reconciliation.
    Quantum-Resilient Sidecar Proxy 2026
    - Built a transparent proxy that protects traffic between legacy services using post-quantum key establishment.
    - Added cryptographic agility with hybrid classical-Kyber key exchange.
    AI Fitness Coach (Major Project)
    • Built an AI-powered fitness web application.
    • Technologies: Next.js, React, Node.js, MySQL
    Hotel Management System | Java, OOP
    • Designed and implemented a hotel management system using Java Collections Framework.
    • Developed features for room booking, availability tracking, and customer management.
    Distributed Key-Value Engine
    - Implemented an in-memory distributed store in Go and Redis.
    - Handled concurrent access with raft consensus and snapshotting.

    Achievements:
    - Smart India Hackathon finalist
  `;

  const draft = extractDraftFromText(multiProjectResume, 1, 0);
  assert.ok(draft.projects, 'Draft should have projects');
  assert.equal(draft.projects.length, 5, `Expected 5 projects, got ${draft.projects.length}`);

  const titles = draft.projects.map((p) => p.title);
  assert.ok(titles.some((t) => t.includes('OpportunityOS')), 'OpportunityOS should be present');
  assert.ok(titles.some((t) => t.includes('Quantum-Resilient Sidecar Proxy')), 'Quantum-Resilient Sidecar Proxy should be present');
  assert.ok(titles.some((t) => t.includes('AI Fitness Coach')), 'AI Fitness Coach should be present');
  assert.ok(titles.some((t) => t.includes('Hotel Management System')), 'Hotel Management System should be present');
  assert.ok(titles.some((t) => t.includes('Distributed Key-Value Engine')), 'Distributed Key-Value Engine should be present');

  // Verify GitHub URL for OpportunityOS
  const oppOs = draft.projects.find((p) => p.title.includes('OpportunityOS'));
  assert.equal(oppOs.github_url, 'https://github.com/KPB040107/OpportunityOS');
  assert.equal(oppOs.dates, '2026');

  // Verify dates for Quantum-Resilient Sidecar Proxy
  const quantum = draft.projects.find((p) => p.title.includes('Quantum-Resilient Sidecar Proxy'));
  assert.equal(quantum.dates, '2026');
  assert.ok(quantum.description.includes('transparent proxy'));

  // Verify Hotel Management System tech
  const hotel = draft.projects.find((p) => p.title.includes('Hotel Management System'));
  assert.ok(hotel.technologies.includes('Java'));

  assert.doesNotThrow(() => validateProfileDraft(draft));
});


