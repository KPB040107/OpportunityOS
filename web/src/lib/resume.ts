// Resume Onboarding Contract - Slice S5
// Strict adherence to OpportunityOS Hackathon Demo Build Guide v3.0 & Next Phase Guide.

export const RESUME_CONTRACT_VERSION = 'profile-draft-v1';
export const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 MiB cap
export const MAX_PDF_PAGES = 10;
export const MAX_RESUME_CHARS = 20000;

/**
 * Validates the raw binary buffer of an uploaded PDF file before any parsing.
 * Enforces magic header, size limits, encryption checks, and executable code checks.
 * @param buffer - Raw byte buffer
 */
export function validatePdfBuffer(buffer: Uint8Array | Buffer): { valid: boolean; fileSize: number } {
  if (!buffer || buffer.length === 0) {
    throw new Error('PDF_EMPTY: Uploaded file is empty.');
  }

  if (buffer.length > MAX_PDF_BYTES) {
    throw new Error(`PDF_TOO_LARGE: File size (${buffer.length} bytes) exceeds 5 MiB limit.`);
  }

  // Check magic number %PDF- (0x25, 0x50, 0x44, 0x46)
  if (
    buffer[0] !== 0x25 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x44 ||
    buffer[3] !== 0x46
  ) {
    throw new Error('INVALID_PDF_SIGNATURE: File does not have a valid %PDF- header.');
  }

  // Scan for dangerous keywords or encryption in the raw header/metadata
  const bufSlice = buffer.subarray(0, Math.min(buffer.length, 65536));
  const rawHeader = Buffer.from(bufSlice).toString('latin1');
  const tailSlice = buffer.subarray(Math.max(0, buffer.length - 65536));
  const rawTail = Buffer.from(tailSlice).toString('latin1');
  const combinedInspection = rawHeader + '\n' + rawTail;

  if (/\/Encrypt\b/i.test(combinedInspection)) {
    throw new Error('ENCRYPTED_PDF_REJECTED: Password-protected or encrypted PDFs are not permitted.');
  }

  if (/\/JavaScript\b|\/JS\b|\/Launch\b/i.test(combinedInspection)) {
    throw new Error('PDF_CONTAINS_EXECUTABLE_CODE: PDF contains embedded scripts or launch actions.');
  }

  return {
    valid: true,
    fileSize: buffer.length,
  };
}

/**
 * Sanitizes plain text extracted from a resume.
 * Replaces null bytes, control characters, and caps maximum length.
 */
export function sanitizeResumeText(text: string): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .slice(0, MAX_RESUME_CHARS);
}

export interface ProfileDraftItem {
  field: string;
  value: string | number;
  state: string;
  evidence: { page: number; quote: string };
}

export interface ProfileDraftSkillItem {
  name: string;
  level: 'beginner' | 'intermediate' | 'advanced' | null;
  state: string;
  evidence: { page: number; quote: string };
}

export interface ProfileDraftPayload {
  contract_version: string;
  base_profile_revision: number;
  fields: ProfileDraftItem[];
  skills: ProfileDraftSkillItem[];
  missing_fields: string[];
}

/**
 * Validates and normalizes an extracted profile draft payload against the profile-draft-v1 contract.
 */
export function validateProfileDraft(draft: ProfileDraftPayload): ProfileDraftPayload {
  if (!draft || typeof draft !== 'object') {
    throw new Error('INVALID_DRAFT: Draft must be a valid object.');
  }

  if (draft.contract_version !== RESUME_CONTRACT_VERSION) {
    throw new Error(`INVALID_CONTRACT_VERSION: Expected ${RESUME_CONTRACT_VERSION}, got ${draft.contract_version}`);
  }

  if (typeof draft.base_profile_revision !== 'number' || draft.base_profile_revision < 0) {
    throw new Error('INVALID_BASE_REVISION: Draft must specify non-negative base_profile_revision.');
  }

  const validFieldNames = new Set([
    'display_name',
    'degree',
    'branch',
    'academic_year',
    'graduation_year',
    'cgpa',
    'cgpa_scale',
  ]);

  if (!Array.isArray(draft.fields)) {
    throw new Error('INVALID_FIELDS: Fields must be an array.');
  }

  for (const item of draft.fields) {
    if (!item || typeof item !== 'object') {
      throw new Error('INVALID_FIELD_ITEM: Field entry must be an object.');
    }
    if (!validFieldNames.has(item.field)) {
      throw new Error(`UNKNOWN_FIELD: Field '${item.field}' is not allowed in profile draft.`);
    }
    if (typeof item.state !== 'string') {
      throw new Error(`INVALID_FIELD_STATE: Field '${item.field}' must declare a state.`);
    }
    if (!item.evidence || typeof item.evidence.quote !== 'string') {
      throw new Error(`MISSING_FIELD_EVIDENCE: Field '${item.field}' must provide a literal evidence quote.`);
    }
  }

  if (!Array.isArray(draft.skills)) {
    throw new Error('INVALID_SKILLS: Skills must be an array.');
  }

  for (const skill of draft.skills) {
    if (!skill || typeof skill.name !== 'string' || !skill.name.trim()) {
      throw new Error('INVALID_SKILL_NAME: Skill entry must have a non-empty name.');
    }
    // Proficiency level MUST be null in initial extracted draft (student must set it)
    if (skill.level !== null && skill.level !== undefined) {
      throw new Error(`UNCONFIRMED_SKILL_LEVEL: Skill '${skill.name}' level must be set by student, not inferred.`);
    }
    if (!skill.evidence || typeof skill.evidence.quote !== 'string') {
      throw new Error(`MISSING_SKILL_EVIDENCE: Skill '${skill.name}' must provide an evidence quote.`);
    }
  }

  if (!Array.isArray(draft.missing_fields)) {
    throw new Error('INVALID_MISSING_FIELDS: missing_fields must be an array of strings.');
  }

  return draft;
}

/**
 * Reconciles an extracted draft with an existing profile to highlight:
 * 1. Proposed values that match existing
 * 2. Proposed values that conflict with existing
 * 3. Newly proposed fields that fill empty profile attributes
 * 4. Existing skills vs newly proposed skills
 */
export function reconcileDraftWithProfile(
  profile: Record<string, unknown> | null,
  draft: ProfileDraftPayload
) {
  const currentProfile = profile || {};
  const rawSkills = Array.isArray(currentProfile.skills) ? (currentProfile.skills as Array<{ skill?: string; name?: string }>) : [];
  const currentSkills = new Set(
    rawSkills.map((s) => (s.skill || s.name || '').toLowerCase())
  );

  const fieldComparisons = draft.fields.map((fieldItem) => {
    const existingVal = currentProfile[fieldItem.field];
    const isNew = existingVal === null || existingVal === undefined || existingVal === '';
    const hasConflict = !isNew && String(existingVal).toLowerCase() !== String(fieldItem.value).toLowerCase();

    return {
      field: fieldItem.field,
      proposedValue: fieldItem.value,
      existingValue: existingVal ?? null,
      isNew,
      hasConflict,
      evidence: fieldItem.evidence,
      state: fieldItem.state,
    };
  });

  const skillComparisons = draft.skills.map((skillItem) => {
    const lowerName = skillItem.name.trim().toLowerCase();
    const alreadyExists = currentSkills.has(lowerName);

    return {
      name: skillItem.name.trim(),
      alreadyExists,
      evidence: skillItem.evidence,
      state: alreadyExists ? 'already_in_profile' : 'needs_confirmation',
    };
  });

  return {
    baseRevision: typeof currentProfile.revision === 'number' ? currentProfile.revision : 0,
    fields: fieldComparisons,
    skills: skillComparisons,
    missingFields: draft.missing_fields || [],
  };
}

/**
 * Validates the student's confirmation payload before submitting to the database.
 * Enforces that any confirmed skill has an explicit level ('beginner'|'intermediate'|'advanced').
 */
export function validateConfirmationPayload(payload: Record<string, unknown>): boolean {
  if (!payload || typeof payload !== 'object') {
    throw new Error('INVALID_PAYLOAD: Confirmation payload must be an object.');
  }

  if (!payload.draft_id) {
    throw new Error('MISSING_DRAFT_ID: draft_id is required.');
  }

  if (typeof payload.expected_revision !== 'number') {
    throw new Error('MISSING_EXPECTED_REVISION: expected_revision must be an integer.');
  }

  if (!payload.selected_fields || typeof payload.selected_fields !== 'object') {
    throw new Error('INVALID_SELECTED_FIELDS: selected_fields must be an object.');
  }

  const selectedFields = payload.selected_fields as Record<string, unknown>;

  // Check CGPA scale clarification
  if (selectedFields.cgpa !== undefined && selectedFields.cgpa !== null) {
    const cgpaVal = Number(selectedFields.cgpa);
    if (isNaN(cgpaVal) || cgpaVal < 0 || cgpaVal > 10) {
      throw new Error('INVALID_CGPA: CGPA must be a valid number between 0 and 10.');
    }
  }

  if (!Array.isArray(payload.skills_with_levels)) {
    throw new Error('INVALID_SKILLS_CONFIRMATION: skills_with_levels must be an array.');
  }

  const validLevels = new Set(['beginner', 'intermediate', 'advanced']);
  for (const s of payload.skills_with_levels as Array<{ name?: unknown; level?: unknown }>) {
    if (!s || typeof s.name !== 'string' || !s.name.trim()) {
      throw new Error('INVALID_CONFIRMED_SKILL: Skill must have a valid name.');
    }
    if (typeof s.level !== 'string' || !validLevels.has(s.level)) {
      throw new Error(`INVALID_SKILL_LEVEL: Skill '${s.name}' must have level 'beginner', 'intermediate', or 'advanced'.`);
    }
  }

  return true;
}

/**
 * Pure deterministic pattern extractor for test fixtures and fallback parsing.
 */
export function extractDraftFromText(
  text: string,
  pageNum: number = 1,
  baseRevision: number = 0
): ProfileDraftPayload {
  const clean = sanitizeResumeText(text);
  const fields: ProfileDraftItem[] = [];
  const skills: ProfileDraftSkillItem[] = [];
  const missing: string[] = [];

  // 1. Degree & Branch detection
  const degreeMatch = clean.match(/\b(B\.?Tech|B\.?E\.?|B\.?Sc|BCA|M\.?Tech|MCA|MS|B\.?Com)\b(?:\s+(?:in|of)\s+([A-Za-z\s]+?)(?:,|\.|\n|$))?/i);
  if (degreeMatch) {
    fields.push({
      field: 'degree',
      value: degreeMatch[1].replace(/\./g, ''),
      state: 'proposed',
      evidence: { page: pageNum, quote: degreeMatch[0].trim() },
    });
    if (degreeMatch[2] && degreeMatch[2].trim().length < 40) {
      fields.push({
        field: 'branch',
        value: degreeMatch[2].trim(),
        state: 'proposed',
        evidence: { page: pageNum, quote: degreeMatch[0].trim() },
      });
    }
  } else {
    missing.push('degree', 'branch');
  }

  // 2. CGPA detection with scale
  const cgpaMatch = clean.match(/\b(?:CGPA|GPA|Score)[\s:]*([0-9]+(?:\.[0-9]+)?)\s*(?:\/\s*([0-9]+))?/i);
  if (cgpaMatch) {
    const rawVal = parseFloat(cgpaMatch[1]);
    const scale = cgpaMatch[2] ? parseFloat(cgpaMatch[2]) : rawVal <= 4.0 ? 4.0 : 10.0;

    fields.push({
      field: 'cgpa',
      value: rawVal,
      state: scale === 4.0 ? 'needs_clarification' : 'proposed',
      evidence: { page: pageNum, quote: cgpaMatch[0].trim() },
    });
    fields.push({
      field: 'cgpa_scale',
      value: scale === 4.0 ? '4.0' : '10.0',
      state: scale === 4.0 ? 'needs_clarification' : 'proposed',
      evidence: { page: pageNum, quote: cgpaMatch[0].trim() },
    });
  } else {
    missing.push('cgpa');
  }

  // 3. Graduation year detection
  const gradMatch = clean.match(/\b(?:Graduat(?:ing|ion)|Batch of|Class of)\s*(?:in)?\s*(202[4-9]|203[0-2])\b/i) ||
                    clean.match(/\b(202[4-9]|203[0-2])\s*(?:Batch|Graduation)\b/i);
  if (gradMatch) {
    fields.push({
      field: 'graduation_year',
      value: parseInt(gradMatch[1], 10),
      state: 'proposed',
      evidence: { page: pageNum, quote: gradMatch[0].trim() },
    });
  } else {
    missing.push('graduation_year');
  }

  // 4. Skills dictionary search
  const commonSkills = [
    'Python', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'Next.js',
    'PostgreSQL', 'SQL', 'Docker', 'Git', 'Java', 'C++', 'Go', 'Rust',
    'Kubernetes', 'AWS', 'Linux', 'Tailwind CSS', 'GraphQL', 'Machine Learning'
  ];

  for (const s of commonSkills) {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    const match = clean.match(regex);
    if (match) {
      skills.push({
        name: s,
        level: null, // Strictly null per requirement
        state: 'needs_confirmation',
        evidence: { page: pageNum, quote: match[0] },
      });
    }
  }

  return {
    contract_version: RESUME_CONTRACT_VERSION,
    base_profile_revision: baseRevision,
    fields,
    skills,
    missing_fields: Array.from(new Set(missing)),
  };
}
