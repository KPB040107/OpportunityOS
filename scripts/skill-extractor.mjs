// Skill and requirement extractor for OpportunityOS discovery pipelines
// Extracts grounded technical skills and requirement statements from job descriptions.

const CANONICAL_SKILL_PATTERNS = [
  // Web & Frontend
  { name: 'HTML', pattern: /\bhtml5?\b/i },
  { name: 'CSS', pattern: /\bcss3?\b/i },
  { name: 'JavaScript', pattern: /\b(?:javascript|js)\b/i },
  { name: 'TypeScript', pattern: /\btypescript\b/i },
  { name: 'React', pattern: /\breact(?:\.js|js)?\b/i },
  { name: 'React Native', pattern: /\breact[- ]native\b/i },
  { name: 'Next.js', pattern: /\bnext(?:\.js|js)?\b/i },
  { name: 'Vue', pattern: /\bvue(?:\.js|js)?\b/i },
  { name: 'Angular', pattern: /\bangular(?:\.js|js)?\b/i },
  { name: 'Tailwind CSS', pattern: /\btailwind(?:\s*css)?\b/i },
  { name: 'Redux', pattern: /\bredux\b/i },
  { name: 'Responsive Design', pattern: /\bresponsive\s+design\b/i },
  { name: 'Accessibility', pattern: /\baccessibility|wcag|section\s+508\b/i },
  { name: 'UI/UX Design', pattern: /\b(?:ui\/ux|user\s+interface|user\s+experience|user[- ]centered\s+design)\b/i },

  // Mobile
  { name: 'Android SDK', pattern: /\bandroid(?:\s+sdk)?\b/i },
  { name: 'iOS', pattern: /\bios(?:\s+sdk)?\b/i },
  { name: 'Swift', pattern: /\bswift\b/i },
  { name: 'Kotlin', pattern: /\bkotlin\b/i },
  { name: 'Objective-C', pattern: /\bobjective[- ]c\b/i },
  { name: 'Flutter', pattern: /\bflutter\b/i },

  // Programming Languages
  { name: 'Python', pattern: /\bpython\b/i },
  { name: 'Java', pattern: /\bjava\b(?!script)/i },
  { name: 'C/C++', pattern: /\b(?:c\s*\/\s*c\+\+|c\+\+|c\s+and\s+c\+\+)\b/i },
  { name: 'C#', pattern: /\bc#|\bc-sharp\b/i },
  { name: '.NET', pattern: /\b\.net\b/i },
  { name: 'Golang', pattern: /\b(?:golang|go\s+programming)\b/i },
  { name: 'Rust', pattern: /\brust\b/i },
  { name: 'Ruby', pattern: /\bruby\b/i },
  { name: 'PHP', pattern: /\bphp\b/i },
  { name: 'SQL', pattern: /\bsql\b/i },
  { name: 'R', pattern: /\br\s+programming\b|\bexperience with r\b/i },

  // Backend & Architecture
  { name: 'Node.js', pattern: /\bnode(?:\.js|js)?\b/i },
  { name: 'Express', pattern: /\bexpress(?:\.js|js)?\b/i },
  { name: 'Django', pattern: /\bdjango\b/i },
  { name: 'Flask', pattern: /\bflask\b/i },
  { name: 'FastAPI', pattern: /\bfastapi\b/i },
  { name: 'Spring Boot', pattern: /\bspring(?:\s+boot)?\b/i },
  { name: 'REST APIs', pattern: /\b(?:rest|restful)(?:\s+apis?)?\b/i },
  { name: 'GraphQL', pattern: /\bgraphql\b/i },
  { name: 'Microservices', pattern: /\bmicroservices\b/i },
  { name: 'Object-Oriented Design', pattern: /\b(?:object[- ]oriented|oop|ood)\b/i },

  // Databases
  { name: 'PostgreSQL', pattern: /\b(?:postgres|postgresql)\b/i },
  { name: 'MySQL', pattern: /\bmysql\b/i },
  { name: 'MongoDB', pattern: /\bmongodb\b/i },
  { name: 'Redis', pattern: /\bredis\b/i },
  { name: 'SQLite', pattern: /\bsqlite\b/i },
  { name: 'Elasticsearch', pattern: /\belasticsearch\b/i },

  // Cloud & DevOps
  { name: 'AWS', pattern: /\b(?:aws|amazon\s+web\s+services)\b/i },
  { name: 'Azure', pattern: /\bazure\b/i },
  { name: 'Google Cloud', pattern: /\b(?:gcp|google\s+cloud)\b/i },
  { name: 'Docker', pattern: /\bdocker\b/i },
  { name: 'Kubernetes', pattern: /\b(?:kubernetes|k8s)\b/i },
  { name: 'Git', pattern: /\b(?:git|github|gitlab)\b/i },
  { name: 'CI/CD', pattern: /\bci\s*\/\s*cd\b/i },
  { name: 'Linux', pattern: /\b(?:linux|unix)\b/i },

  // AI & Data Science
  { name: 'Machine Learning', pattern: /\bmachine\s+learning\b/i },
  { name: 'Deep Learning', pattern: /\bdeep\s+learning\b/i },
  { name: 'Artificial Intelligence', pattern: /\bartificial\s+intelligence\b/i },
  { name: 'NLP', pattern: /\b(?:nlp|natural\s+language\s+processing)\b/i },
  { name: 'Computer Vision', pattern: /\bcomputer\s+vision\b/i },
  { name: 'PyTorch', pattern: /\bpytorch\b/i },
  { name: 'TensorFlow', pattern: /\btensorflow\b/i },
  { name: 'Pandas', pattern: /\bpandas\b/i },
  { name: 'NumPy', pattern: /\bnumpy\b/i },

  // Core CS Concepts & Productivity
  { name: 'Data Structures', pattern: /\bdata\s+structures\b/i },
  { name: 'Algorithms', pattern: /\balgorithms?\b/i },
  { name: 'Agile', pattern: /\b(?:agile|scrum)\b/i },
  { name: 'MS Excel', pattern: /\b(?:ms\s+excel|excel)\b/i },
  { name: 'PowerPoint', pattern: /\b(?:powerpoint|ppt)\b/i },
  { name: 'Project Management', pattern: /\bproject\s+management\b/i },
  { name: 'Figma', pattern: /\bfigma\b/i }
];

export function extractSkillsFromText(text = '') {
  if (!text || typeof text !== 'string') return [];
  const found = new Set();
  for (const { name, pattern } of CANONICAL_SKILL_PATTERNS) {
    if (pattern.test(text)) {
      found.add(name);
    }
  }
  return Array.from(found);
}

export function extractRequirementsFromText(text = '') {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const requirements = [];

  let inQualificationSection = false;
  let sectionIsPreferred = false;

  const qualSectionRegex = /^(?:qualifications|requirements|what we are looking for|basic qualifications|minimum qualifications|preferred qualifications|eligibility criteria|skills required|what you'?ll need)/i;
  const preferredSectionRegex = /^(?:preferred qualifications|nice to have|bonus points|good to have|preferred skills)/i;
  const endSectionRegex = /^(?:about us|about the company|what we offer|benefits|perks|compensation|equal opportunity|eeo|how to apply)/i;

  for (const line of lines) {
    if (endSectionRegex.test(line)) {
      inQualificationSection = false;
      continue;
    }

    if (qualSectionRegex.test(line)) {
      inQualificationSection = true;
      sectionIsPreferred = preferredSectionRegex.test(line);
      continue;
    }

    if (inQualificationSection) {
      // Look for bullet points or criteria lines
      const isBullet = /^[•\-\*\d+\.]\s+/.test(line);
      const cleanLine = line.replace(/^[•\-\*\d+\.]\s+/, '').trim();

      if (cleanLine.length < 5 || cleanLine.length > 300) continue;

      // Determine if mandatory
      const isExplicitPreferred = /\b(?:preferred|plus|bonus|nice to have|optional|helpful)\b/i.test(cleanLine);
      const isExplicitMandatory = /\b(?:must|required|mandatory|essential|minimum|at least|only)\b/i.test(cleanLine);
      const mandatory = !sectionIsPreferred && (isExplicitMandatory || (!isExplicitPreferred && isBullet));

      // Determine kind
      let kind = 'other';
      if (/\b(?:degree|b\.?tech|b\.?e\.?|m\.?tech|bca|mca|bachelor|master|diploma)\b/i.test(cleanLine)) kind = 'degree';
      else if (/\b(?:cgpa|gpa|percentage|marks)\b/i.test(cleanLine)) kind = 'cgpa';
      else if (/\b(?:batch|graduat(?:ing|ion)|class of|passout)\b/i.test(cleanLine)) kind = 'academic_year';
      else if (/\b(?:computer science|information technology|electronics|mechanical|branch)\b/i.test(cleanLine)) kind = 'branch';
      else if (/\b(?:location|relocat|remote|hybrid|office|bangalore|bengaluru|pune|hyderabad|mumbai|delhi|noida|gurugram|chennai)\b/i.test(cleanLine)) kind = 'location';
      else if (extractSkillsFromText(cleanLine).length > 0) kind = 'skill';

      requirements.push({
        kind,
        value: cleanLine,
        mandatory,
        evidence: cleanLine
      });

      if (requirements.length >= 10) break; // Keep bounded
    }
  }

  // Fallback: If no explicit sections were parsed, scan for high-signal bullet points
  if (requirements.length === 0) {
    for (const line of lines) {
      const isBullet = /^[•\-\*\d+\.]\s+/.test(line);
      if (!isBullet) continue;
      const cleanLine = line.replace(/^[•\-\*\d+\.]\s+/, '').trim();
      const skillsInLine = extractSkillsFromText(cleanLine);
      if (skillsInLine.length > 0) {
        requirements.push({
          kind: 'skill',
          value: cleanLine,
          mandatory: /\b(?:must|required|mandatory|essential)\b/i.test(cleanLine),
          evidence: cleanLine
        });
        if (requirements.length >= 8) break;
      }
    }
  }

  return requirements;
}

export function extractSkillsAndRequirements(text = '') {
  return {
    skills: extractSkillsFromText(text),
    requirements: extractRequirementsFromText(text)
  };
}
