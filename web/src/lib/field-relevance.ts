// Field & Domain Relevance Classifier for Web UI
// Determines if an opportunity is relevant to a student's academic branch/field of study.
// Specifically handles the relationship between Computer Science and Data Science:
// 1. A Computer Science student sees CS / Software roles AND Data Science / AI / ML roles.
// 2. A Data Science student sees Data Science / AI / ML roles AND general Computer Science / Software roles (since Data Science is part of Computer Science).
// 3. Unrelated fields (Sales, Marketing, HR, Business Finance, Legal, Logistics, Culinary, Healthcare) are excluded.

export function normalizeBranch(branch?: string | null): string {
  if (!branch) return '';
  return String(branch)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\w\s&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isTechOrCsBranch(branch?: string | null): boolean {
  const b = normalizeBranch(branch);
  if (!b) return false;
  return /\b(?:computer|software|cse|cs|information technology|infotech|\bit\b|computing|programming)\b/i.test(b);
}

export function isDataScienceBranch(branch?: string | null): boolean {
  const b = normalizeBranch(branch);
  if (!b) return false;
  return /\b(?:data science|data analytics|machine learning|artificial intelligence|\bai\b|\bml\b|ai & ds|data engineering|business analytics)\b/i.test(b);
}

// Patterns of roles that are unambiguously outside the Computer Science / Data Science field
const UNRELATED_NON_TECH_PATTERNS = [
  // Sales & Business Development
  /\b(?:account executive|sales executive|sales manager|sales representative|business development representative|\bbdr\b|\bsdr\b|inside sales|commercial hunter|commercial grower|telecaller|territory manager|sales director)\b/i,
  // Legal & Compliance
  /\b(?:general counsel|corporate counsel|legal counsel|privacy counsel|paralegal|attorney|lawyer|compliance manager|regulatory affairs)\b/i,
  // Non-tech Finance & Accounting
  /\b(?:business finance|corporate finance|statutory audit|tax manager|financial controller|accounts payable|accounts receivable|payroll specialist|treasury)\b/i,
  // Non-tech Marketing & PR
  /\b(?:performance marketing|growth marketing|brand marketing|seo specialist|social media manager|copywriter|public relations|creative director)\b/i,
  // HR & Recruiting
  /\b(?:human resources|recruiter|talent acquisition|\bhr\b|\bhrbp\b|people partner|hr specialist)\b/i,
  // Logistics, Operations & Physical Security
  /\b(?:cluster head|last mile|warehouse manager|fleet manager|logistics coordinator|facilities manager|loss prevention|security & investigation)\b/i,
  // Clinical / Healthcare / Culinary
  /\b(?:nurse|physician|clinical specialist|chef|culinary|line cook)\b/i
];

// Technical, software, and data keywords
const TECH_AND_DATA_PATTERNS = [
  /\b(?:software|developer|sde|swe|frontend|front[- ]end|backend|back[- ]end|fullstack|full[- ]stack|web|mobile|android|ios)\b/i,
  /\b(?:engineer|engineering|devops|sre|site reliability|cloud|infrastructure|systems?|platform|network|linux)\b/i,
  /\b(?:data scientist|data science|data analyst|data analytics|data engineer|big data|etl|bi developer|decision science)\b/i,
  /\b(?:machine learning|deep learning|artificial intelligence|\bai\b|\bml\b|nlp|computer vision|genai|llm)\b/i,
  /\b(?:security engineer|cybersecurity|infosec|application security|red team|penetration tester|cryptography)\b/i,
  /\b(?:qa|quality assurance|automation engineer|test engineer|sdet)\b/i,
  /\b(?:research intern|research scientist|algorithm|computational|quant developer|quantitative)\b/i,
  /\b(?:hackathon|bounty|code challenge|coding competition)\b/i
];

export interface FieldRelevanceResult {
  relevant: boolean;
  reason?: string;
  matchedDomain?: string;
}

/**
 * Checks if a role is relevant to a student's branch of study.
 */
export function isRoleRelevantToField(
  opportunity: { title: string; skills?: string[]; type?: string },
  profileBranch?: string | null
): FieldRelevanceResult {
  if (!profileBranch || !opportunity?.title) {
    return { relevant: true, reason: 'No profile branch or opportunity title' };
  }

  const branchNorm = normalizeBranch(profileBranch);
  const title = String(opportunity.title).trim();
  const type = String(opportunity.type || '').toLowerCase().trim();

  // Hackathons are universally relevant to tech/engineering students
  if (type === 'hackathon') {
    return { relevant: true, matchedDomain: 'hackathon' };
  }

  const isCS = isTechOrCsBranch(branchNorm);
  const isDS = isDataScienceBranch(branchNorm);

  if (isCS || isDS) {
    const hasExplicitUnrelated = UNRELATED_NON_TECH_PATTERNS.some((pattern) => pattern.test(title));
    const hasExplicitTech = TECH_AND_DATA_PATTERNS.some((pattern) => pattern.test(title));

    // If title has tech keyword (e.g., "Software Engineer - Sales Tech", "Security Engineer"), it is tech
    if (hasExplicitTech) {
      return { relevant: true, matchedDomain: isDS ? 'data_science_and_cs' : 'computer_science' };
    }

    // If title has explicit non-tech pattern and lacks tech keyword, it is unrelated
    if (hasExplicitUnrelated) {
      const fieldName = isDS ? 'Data Science' : 'Computer Science';
      return {
        relevant: false,
        reason: `This role (${title}) is outside your field of study (${fieldName}).`,
        matchedDomain: 'unrelated'
      };
    }

    // If title doesn't match either, check skills array for tech presence
    const skillList = Array.isArray(opportunity.skills) ? opportunity.skills.map((s) => String(s).toLowerCase()) : [];
    const hasTechSkill = skillList.some((s) =>
      ['python', 'javascript', 'typescript', 'react', 'node', 'java', 'c++', 'sql', 'aws', 'docker', 'machine learning'].includes(s)
    );

    if (hasTechSkill) {
      return { relevant: true, matchedDomain: 'skills_corroborated' };
    }
  }

  return { relevant: true };
}
