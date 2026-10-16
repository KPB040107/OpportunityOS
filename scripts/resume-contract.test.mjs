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
