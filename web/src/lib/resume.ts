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
  suggested_level?: 'beginner' | 'intermediate' | 'advanced' | null;
  confidence?: number | null;
  state: string;
  evidence: { page: number; quote: string };
}

export interface ProfileDraftProjectItem {
  title: string;
  description: string;
  technologies: string[];
  github_url?: string | null;
  dates?: string | null;
  evidence: { page: number; quote: string };
}

export interface ProfileDraftPayload {
  contract_version: string;
  base_profile_revision: number;
  fields: ProfileDraftItem[];
  skills: ProfileDraftSkillItem[];
  projects?: ProfileDraftProjectItem[];
  years_of_experience?: number | null;
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

  const rev = typeof draft.base_profile_revision === 'number'
    ? draft.base_profile_revision
    : parseInt(String(draft.base_profile_revision), 10);
  if (!Number.isFinite(rev) || rev < 0) {
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
    'years_of_experience',
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

  const validSkillLevels = new Set(['beginner', 'intermediate', 'advanced', null, undefined]);
  for (const skill of draft.skills) {
    if (!skill || typeof skill.name !== 'string' || !skill.name.trim()) {
      throw new Error('INVALID_SKILL_NAME: Skill entry must have a non-empty name.');
    }
    if (!validSkillLevels.has(skill.level)) {
      throw new Error(`INVALID_SKILL_LEVEL: Skill '${skill.name}' level must be 'beginner', 'intermediate', 'advanced', or null.`);
    }
    if (!skill.evidence || typeof skill.evidence.quote !== 'string') {
      throw new Error(`MISSING_SKILL_EVIDENCE: Skill '${skill.name}' must provide an evidence quote.`);
    }
  }

  if (draft.projects !== undefined && draft.projects !== null) {
    if (!Array.isArray(draft.projects)) {
      throw new Error('INVALID_PROJECTS: Projects must be an array.');
    }
    for (const project of draft.projects) {
      if (!project || typeof project.title !== 'string' || !project.title.trim()) {
        throw new Error('INVALID_PROJECT_TITLE: Project entry must have a non-empty title.');
      }
      if (!project.evidence || typeof project.evidence.quote !== 'string') {
        throw new Error(`MISSING_PROJECT_EVIDENCE: Project '${project.title}' must provide an evidence quote.`);
      }
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
 * 4. Existing skills vs newly proposed skills (with suggested levels and evidence)
 * 5. Existing projects vs newly proposed projects
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
      level: skillItem.level ?? null,
      suggestedLevel: skillItem.suggested_level ?? skillItem.level ?? null,
      confidence: skillItem.confidence ?? null,
      evidence: skillItem.evidence,
      state: alreadyExists ? 'already_in_profile' : 'needs_confirmation',
    };
  });

  const rawProjects = Array.isArray(currentProfile.projects) ? (currentProfile.projects as Array<{ title?: string }>) : [];
  const existingProjectTitles = new Set(
    rawProjects.map((p) => (p.title || '').toLowerCase().trim())
  );
  const draftProjects = Array.isArray(draft.projects) ? draft.projects : [];
  const projectComparisons = draftProjects.map((proj) => {
    const lowerTitle = (proj.title || '').toLowerCase().trim();
    const alreadyExists = existingProjectTitles.has(lowerTitle);
    return {
      title: proj.title.trim(),
      description: proj.description || '',
      technologies: Array.isArray(proj.technologies) ? proj.technologies : [],
      github_url: proj.github_url || null,
      dates: proj.dates || null,
      alreadyExists,
      evidence: proj.evidence,
      state: alreadyExists ? 'already_in_profile' : 'proposed',
    };
  });

  return {
    baseRevision: typeof currentProfile.revision === 'number' ? currentProfile.revision : 0,
    fields: fieldComparisons,
    skills: skillComparisons,
    projects: projectComparisons,
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

  // Check years of experience if provided
  if (selectedFields.years_of_experience !== undefined && selectedFields.years_of_experience !== null && selectedFields.years_of_experience !== '') {
    const expVal = Number(selectedFields.years_of_experience);
    if (isNaN(expVal) || expVal < 0 || expVal > 50) {
      throw new Error('INVALID_EXPERIENCE_YEARS: Years of experience must be a non-negative number.');
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
    if (typeof s.level !== 'string' || !validLevels.has(s.level.toLowerCase())) {
      throw new Error(`INVALID_SKILL_LEVEL: Skill '${s.name}' must have level 'beginner', 'intermediate', or 'advanced'.`);
    }
  }

  // Validate proposed projects if present
  if (payload.projects !== undefined && payload.projects !== null) {
    if (!Array.isArray(payload.projects)) {
      throw new Error('INVALID_PROJECTS_CONFIRMATION: projects must be an array.');
    }
    for (const p of payload.projects as Array<{ title?: unknown; github_url?: unknown }>) {
      if (!p || typeof p.title !== 'string' || !p.title.trim()) {
        throw new Error('INVALID_PROJECT: Project must have a valid title.');
      }
      if (p.github_url && typeof p.github_url === 'string') {
        if (!p.github_url.toLowerCase().includes('github.com')) {
          throw new Error('INVALID_GITHUB_URL: GitHub URL must be a valid github.com link.');
        }
      }
    }
  }

  // Validate consents if present
  if (payload.consents !== undefined && payload.consents !== null) {
    if (typeof payload.consents !== 'object' || Array.isArray(payload.consents)) {
      throw new Error('INVALID_CONSENTS: consents must be an object.');
    }
  }

  return true;
}

export function isBulletLine(line: string): boolean {
  const clean = line.trim();
  return /^[•\-\*o\u2022\u2023\u25E6\u2043\u2219\u00B7\u25AA\u25CF\u2192∩é╖ΓÇó]\s+/i.test(clean) ||
         /^\d+[\.\)]\s+/.test(clean);
}

export function isMetaLine(line: string): boolean {
  const clean = line.replace(/^[•\-\*o\u2022\u2023\u25E6\u2043\u2219\u00B7\u25AA\u25CF\u2192∩é╖ΓÇó\s\d\.)]+/, '').trim();
  return /^(?:Tech(?:nologies| stack)?|Built with|Tools?|Stack|Languages|Frameworks?|Libraries|GitHub|Link|Live|Demo)\s*[:\-]/i.test(clean) ||
         /^(?:https?:\/\/|github\.com)/i.test(clean);
}

const ACTION_VERB_START = /^(?:Built|Implemented|Developed|Designed|Created|Engineered|Led|Worked|Maintained|Responsible|Handled|Utilized|Added|Architected|Spearheaded|Collaborated|Optimized|Automated|Deployed|Integrated|Authored|Wrote|Configured|Tested|Managed|Conducted|Generated)\b/i;

export function splitProjectChunks(secText: string): string[] {
  const doubleNewlineBlocks = secText.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const resultChunks: string[] = [];

  for (const block of doubleNewlineBlocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    let currentProjectLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isBullet = isBulletLine(line);
      const isMeta = isMetaLine(line);

      const prevLine = currentProjectLines[currentProjectLines.length - 1];
      const prevEndsSentence = prevLine && (/[.!;]$/.test(prevLine) || isBulletLine(prevLine) || isMetaLine(prevLine));
      const prevCanEndProject = currentProjectLines.length >= 2 || prevEndsSentence;

      const isActionVerb = ACTION_VERB_START.test(line);

      const looksLikeTitle = !isBullet && !isMeta && !isActionVerb && line.length >= 3 && line.length <= 110 &&
        (!/^[a-z]/.test(line) || line.includes('|') || line.includes(' - ') || line.includes('–')) &&
        (
          line.includes('|') ||
          /\b20\d{2}\b/.test(line) ||
          /\((?:major|minor|personal|academic|full[- ]stack|web|app|mobile|client|server)[^)]*\)/i.test(line) ||
          line.includes(' - ') ||
          line.includes('–') ||
          line.includes('—') ||
          /^(?:Project\s+\d+|[A-Z][A-Za-z0-9_\s]{2,40}\s*:)/i.test(line) ||
          (i + 1 < lines.length && (isBulletLine(lines[i + 1]) || isMetaLine(lines[i + 1]))) ||
          (prevEndsSentence && !/[.!;]$/.test(line) && line.length <= 80 && i + 1 < lines.length)
        );

      if (looksLikeTitle && prevCanEndProject && currentProjectLines.length > 0) {
        resultChunks.push(currentProjectLines.join('\n'));
        currentProjectLines = [line];
      } else {
        currentProjectLines.push(line);
      }
    }

    if (currentProjectLines.length > 0) {
      resultChunks.push(currentProjectLines.join('\n'));
    }
  }

  return resultChunks;
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
  const rawRev = typeof baseRevision === 'number' ? baseRevision : parseInt(String(baseRevision), 10);
  const safeBaseRevision = Number.isFinite(rawRev) && rawRev >= 0 ? rawRev : 0;
  const fields: ProfileDraftItem[] = [];
  const skills: ProfileDraftSkillItem[] = [];
  const projects: ProfileDraftProjectItem[] = [];
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
  const gradMatch = clean.match(/\b(?:Graduat(?:ing|ion)|Batch of|Class of)\s*(?:in)?\s*(20[1-2][0-9]|203[0-2])\b/i) ||
                    clean.match(/\b(20[1-2][0-9]|203[0-2])\s*(?:Batch|Graduation)\b/i);
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

  // 4. Professional Experience (explicit years, NOT calculated by counting projects)
  const expMatch = clean.match(/\b([0-9]+(?:\.[0-9]+)?)\+?\s*years?(?:\s+of)?\s+(?:professional|industry|work|full-time)\s+experience\b/i) ||
                   clean.match(/\b(?:total\s+)?(?:work|professional|industry)\s+experience\s*[:\-\s]*([0-9]+(?:\.[0-9]+)?)\+?\s*years?\b/i) ||
                   clean.match(/\bExperience\s*[:\-]\s*([0-9]+(?:\.[0-9]+)?)\+?\s*years?\b/i);
  let expYears: number | null = null;
  if (expMatch) {
    const rawExp = parseFloat(expMatch[1]);
    if (!isNaN(rawExp)) {
      expYears = rawExp;
      fields.push({
        field: 'years_of_experience',
        value: expYears,
        state: 'proposed',
        evidence: { page: pageNum, quote: expMatch[0].trim() },
      });
    }
  }

  // 5. Projects Extraction (detect project sections, titles, descriptions, tech stack, github links, evidence)
  const commonSkills = [
    'Python', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'Next.js',
    'PostgreSQL', 'SQL', 'Docker', 'Git', 'Java', 'C++', 'Go', 'Rust',
    'Kubernetes', 'AWS', 'Linux', 'Tailwind CSS', 'GraphQL', 'Machine Learning'
  ];

  const projectHeaderMatch = clean.match(/(?:^|\n)\s*(?:[#*=-]+\s*)?(?:Key|Academic|Personal|Featured|Selected|Recent|Technical|Software|Major|Course|Independent)?\s*Projects?(?:\s+(?:Work|Experience|Portfolio|Undertaken|Accomplishments))?\s*[:\n]/i);

  if (projectHeaderMatch) {
    const afterHeader = clean.slice(projectHeaderMatch.index! + projectHeaderMatch[0].length);
    const nextHeaderMatch = afterHeader.match(/\n\s*(?:[#*=-]+\s*)?(?:Work\s+Experience|Experience|Professional\s+Experience|Employment|Education|Technical\s+Skills|Skills|Certifications?|Achievements?|Publications?|Awards?|Interests|Extracurricular(?:\s+Activities)?|Leadership|Positions\s+of\s+Responsibility|Volunteer(?:ing|\s+Experience)?|Coursework|Declaration|References)\s*[:\n]/i);
    const secText = nextHeaderMatch ? afterHeader.slice(0, nextHeaderMatch.index).trim() : afterHeader.trim();

    if (secText) {
      const rawChunks = splitProjectChunks(secText);

      for (const chunk of rawChunks) {
        const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length === 0) continue;

        const ghMatch = chunk.match(/https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i) ||
                        chunk.match(/\bgithub\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i);
        const githubUrl = ghMatch ? (ghMatch[0].startsWith('http') ? ghMatch[0] : `https://${ghMatch[0]}`) : null;

        const rangeDateMatch = chunk.match(/\b(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})\s*[-–—to]+\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4}|Present|Current)\b/i);
        const singleYearMatch = chunk.match(/\b(20\d{2})\b/);
        const dates = rangeDateMatch ? rangeDateMatch[0].trim() : (singleYearMatch ? singleYearMatch[1] : null);

        const detectedTech: string[] = [];
        const techLineMatch = chunk.match(/(?:Tech(?:nologies| stack)?|Built with|Tools?|Stack)\s*[:\-]\s*([^\n]+)/i);
        if (techLineMatch) {
          const parts = techLineMatch[1].split(/[,|/•]+/).map((t) => t.trim()).filter(Boolean);
          detectedTech.push(...parts);
        }

        let rawTitle = lines[0]
          .replace(/^[#*•\-\d\.)\s]+/, '')
          .replace(/^(?:Project\s+\d+[:\s\-]*)/i, '')
          .replace(/https?:\/\/github\.com\/[^\s]+/gi, '')
          .replace(/github\.com\/[^\s]+/gi, '')
          .trim();

        if (rawTitle.includes('|')) {
          const parts = rawTitle.split('|').map((p) => p.trim());
          rawTitle = parts[0];
          if (parts[1]) {
            const extraTech = parts.slice(1).join(' ').split(/[,/]+/).map((t) => t.trim()).filter(Boolean);
            detectedTech.push(...extraTech);
          }
        }
        if (rangeDateMatch && rawTitle.includes(rangeDateMatch[0])) {
          rawTitle = rawTitle.replace(rangeDateMatch[0], '').replace(/[()\-–—]/g, '').trim();
        }
        rawTitle = rawTitle.replace(/\s+20\d{2}$/, '').trim();

        for (const s of commonSkills) {
          const sRegex = new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          if (sRegex.test(chunk) && !detectedTech.some((t) => t.toLowerCase() === s.toLowerCase())) {
            detectedTech.push(s);
          }
        }

        if (rawTitle.length >= 3 && rawTitle.length <= 100) {
          const descLines = lines.slice(1).filter((l) => {
            const cleanL = l.replace(/^[#*•\-\d\.)\s]+/, '').trim();
            return !cleanL.match(/^(?:Tech(?:nologies| stack)?|Built with|Tools?|Stack|Languages|Frameworks?|Libraries|GitHub|Link|Live|Demo)\s*[:\-]/i) &&
                   !cleanL.match(/^(?:https?:\/\/|github\.com)/i);
          });
          const description = descLines.join(' ').replace(/^[#*•\-\s]+/, '').trim() || lines[0];

          projects.push({
            title: rawTitle,
            description: description.slice(0, 500),
            technologies: Array.from(new Set(detectedTech)),
            github_url: githubUrl,
            dates,
            evidence: {
              page: pageNum,
              quote: chunk.slice(0, 160).trim(),
            },
          });
        }
      }
    }
  } else {
    const ghMatches = clean.matchAll(/(?:https?:\/\/)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/gi);
    for (const m of ghMatches) {
      const repoName = m[2].replace(/[._-]/g, ' ');
      const title = repoName.charAt(0).toUpperCase() + repoName.slice(1);
      const url = m[0].startsWith('http') ? m[0] : `https://${m[0]}`;
      if (!projects.some((p) => p.github_url === url)) {
        projects.push({
          title,
          description: `Repository at ${url}`,
          technologies: [],
          github_url: url,
          dates: null,
          evidence: {
            page: pageNum,
            quote: m[0],
          },
        });
      }
    }
  }

  // 6. Skills dictionary search & Suggested Level inference
  for (const s of commonSkills) {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    const match = clean.match(regex);
    if (!match) continue;

    let suggestedLevel: 'beginner' | 'intermediate' | 'advanced' | null = null;
    let confidence: number | null = null;
    let evidenceQuote = match[0];

    // (a) Explicit self-description
    const advancedSelfDesc = clean.match(new RegExp(`(?:advanced|expert|proficient\\s+in|mastery\\s+of)\\s+${escaped}\\b`, 'i')) ||
                             clean.match(new RegExp(`\\b${escaped}\\s*\\((?:advanced|expert|proficient)\\)`, 'i'));
    const interSelfDesc = clean.match(new RegExp(`(?:intermediate|working\\s+knowledge\\s+of|hands-on\\s+with|familiar\\s+with|competent\\s+in)\\s+${escaped}\\b`, 'i')) ||
                          clean.match(new RegExp(`\\b${escaped}\\s*\\((?:intermediate)\\)`, 'i'));
    const begSelfDesc = clean.match(new RegExp(`(?:beginner|basic|learning|introductory|elementary)\\s+${escaped}\\b`, 'i')) ||
                        clean.match(new RegExp(`\\b${escaped}\\s*\\((?:beginner|basic)\\)`, 'i'));

    if (advancedSelfDesc) {
      suggestedLevel = 'advanced';
      confidence = 0.90;
      evidenceQuote = advancedSelfDesc[0].trim();
    } else if (interSelfDesc) {
      suggestedLevel = 'intermediate';
      confidence = 0.85;
      evidenceQuote = interSelfDesc[0].trim();
    } else if (begSelfDesc) {
      suggestedLevel = 'beginner';
      confidence = 0.85;
      evidenceQuote = begSelfDesc[0].trim();
    }

    // (b) Duration check if no self-description
    if (!suggestedLevel) {
      const durationMatch = clean.match(new RegExp(`(?:([0-9]+(?:\\.[0-9]+)?)\\+?\\s*years?(?:\\s+of)?(?:\\s+experience\\s+(?:in|with))?\\s+${escaped}|${escaped}[^\\n.]{0,30}?([0-9]+(?:\\.[0-9]+)?)\\+?\\s*years?)`, 'i'));
      if (durationMatch) {
        const years = parseFloat(durationMatch[1] || durationMatch[2]);
        if (!isNaN(years)) {
          if (years >= 3) {
            suggestedLevel = 'advanced';
            confidence = 0.85;
          } else if (years >= 1) {
            suggestedLevel = 'intermediate';
            confidence = 0.80;
          } else {
            suggestedLevel = 'beginner';
            confidence = 0.75;
          }
          evidenceQuote = durationMatch[0].trim();
        }
      }
    }

    // (c) Project context and repeated usage
    if (!suggestedLevel) {
      const occurrences = (clean.match(new RegExp(`\\b${escaped}\\b`, 'gi')) || []).length;
      const associatedProjects = projects.filter(
        (p) => p.technologies.some((t) => t.toLowerCase() === s.toLowerCase()) ||
               p.description.toLowerCase().includes(s.toLowerCase())
      );

      if (associatedProjects.length >= 2 || (associatedProjects.length >= 1 && occurrences >= 3)) {
        suggestedLevel = 'intermediate';
        confidence = 0.80;
        evidenceQuote = `Demonstrated across ${associatedProjects.length} projects (${associatedProjects.map((p) => p.title).join(', ')})`;
      } else if (associatedProjects.length === 1 && occurrences >= 2) {
        suggestedLevel = 'intermediate';
        confidence = 0.70;
        evidenceQuote = `Applied in project ${associatedProjects[0].title}`;
      }
    }

    skills.push({
      name: s,
      level: suggestedLevel,
      suggested_level: suggestedLevel,
      confidence,
      state: 'needs_confirmation',
      evidence: { page: pageNum, quote: evidenceQuote },
    });
  }

  return {
    contract_version: RESUME_CONTRACT_VERSION,
    base_profile_revision: safeBaseRevision,
    fields,
    skills,
    projects,
    years_of_experience: expYears,
    missing_fields: Array.from(new Set(missing)),
  };
}
