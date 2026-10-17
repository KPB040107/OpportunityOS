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
  { name: 'Next.js', pattern: /\bnext(?:\.js|js)\b/i },
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
  { name: 'MS Excel', pattern: /\b(?:ms\s+excel|microsoft\s+excel|\bexcel\b(?!\s+(?:in|at|under|with)\b))/i },
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

const HEADING_LINE_REGEX = /^(?:#{1,6}\s+|(?:\*{1,3}|_{1,3})|(?:\d+\.|\b[A-Z0-9_-]+\b\s*[:–-]))?\s*(?:about(?:\s+(?:us|the\s+company|the\s+role|the\s+team|the\s+hackathon|the\s+event))?|overview|responsibilities|roles?\s+(?:&|and)\s+responsibilities|key\s+responsibilities|what\s+you(?:'ll|\s+will)\s+do|qualifications|basic\s+qualifications|minimum\s+qualifications|preferred\s+qualifications|requirements|job\s+requirements|role\s+requirements|skills?\s+(?:&|and)\s+requirements|required\s+skills?|eligibility(?:\s+(?:criteria|requirements|rules))?|who\s+can\s+participate|who\s+is\s+eligible|who\s+should\s+apply|who\s+you\s+are|what\s+you\s+bring|rules|hackathon\s+rules|participation\s+rules|competition\s+rules|guidelines|terms\s+(?:&|and)\s+conditions|prizes(?:\s+(?:&|and)\s+(?:rewards|awards))?|awards|bounties|what\s+to\s+build|problem\s+statements?|challenges|themes|tracks|submission\s+(?:guidelines|requirements|criteria)|submissions?|how\s+to\s+submit|important\s+dates|timeline|schedule|deadlines?|what\s+we\s+offer|benefits|perks|compensation|judging(?:\s+criteria)?|evaluation\s+criteria)\b/i;

const qualSectionRegex = /^(?:qualifications|requirements|required\s+skills|skills\s+required|what\s+we\s+are\s+looking\s+for|who\s+you\s+are|what\s+you\s+bring|key\s+requirements|technical\s+skills|eligibility(?:\s+(?:criteria|requirements|rules))?|who\s+can\s+participate|who\s+is\s+eligible|who\s+should\s+apply|basic\s+qualifications|minimum\s+qualifications|preferred\s+qualifications|what\s+you'?ll\s+need|what\s+you\s+will\s+need|role\s+requirements|job\s+requirements|desired\s+profile|candidate\s+profile|skills\s+&\s+requirements|requirements\s+&\s+qualifications|must[- ]haves?|rules|hackathon\s+rules|participation\s+rules|what\s+to\s+build)\b/i;
const preferredSectionRegex = /^(?:preferred\s+qualifications|nice\s+to\s+have|nice-to-have|bonus\s+points|bonus\s+qualifications|good\s+to\s+have|good-to-have|preferred\s+skills|preferred\s+requirements|what\s+would\s+be\s+nice\s+to\s+have|plus|bonus|optional\s+qualifications)\b/i;
const benefitSectionRegex = /^(?:what\s+we\s+offer|benefits|perks|compensation|what\s+you'?ll\s+get|what\s+you\s+get|stipend\s+&\s+perks|perks\s+&\s+benefits|why\s+join\s+us)\b/i;
const endSectionRegex = /^(?:about\s+us|about\s+the\s+company|about\s+the\s+team|equal\s+opportunity|eeo|how\s+to\s+apply|selection\s+process|hiring\s+process|interview\s+process|application\s+process)\b/i;

const softSkillRegex = /\b(?:team\s+player|communication(?:\s+skills?)?|written\s+and\s+verbal|eager\s+to\s+learn|willingness\s+to\s+learn|fast\s+learner|quick\s+learner|self-starter|self-motivated|problem[- ]solving|problem\s+solver|interpersonal(?:\s+skills?)?|adaptability|attention\s+to\s+detail|work\s+independently|collaborative|collaboration|passion\s+for|passionate\s+about|enthusiastic|positive\s+attitude|growth\s+mindset|work\s+ethic|time\s+management|critical\s+thinking|curious|ownership\s+mindset|organizational\s+skills?|analytical\s+mindset|creative\s+thinking)\b/i;
const explicitPreferredRegex = /\b(?:preferred|plus|bonus|nice\s+to\s+have|nice-to-have|good\s+to\s+have|good-to-have|optional|helpful|not\s+mandatory|not\s+required|an\s+advantage)\b/i;
const explicitMandatoryRegex = /\b(?:must|required|mandatory|essential|minimum|at\s+least|only|strictly)\b/i;
const eligibilityRuleRegex = /\b(?:legal\s+age(?:\s+of\s+majority)?|age\s+of\s+majority|at\s+least\s+18|18\s+years?(?:\s+old)?|minimum\s+age|excluded|not\s+eligible|prohibited|void\s+where\s+prohibited|residents\s+of|embargoed|territor(?:y|ies)\s+excluded|countries\s+excluded)\b/i;

export function chunkListingByHeadings(text = '', maxChunkSize = 20000) {
  if (!text || typeof text !== 'string') return [];
  if (text.length <= maxChunkSize) {
    return [{ heading: 'Full', text }];
  }
  const lines = text.split(/\r?\n/);
  const sections = [];
  let currentHeading = 'Intro';
  let currentLines = [];

  const isHeadingLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^#{1,6}\s+/.test(trimmed)) return true;
    const stripped = trimmed.replace(/^[#*_~<>\s\-\d\.]+|[#*_~<>:\s]+$/g, '').trim();
    if (!stripped) return false;
    return HEADING_LINE_REGEX.test(stripped);
  };

  for (const line of lines) {
    if (isHeadingLine(line)) {
      if (currentLines.length > 0) {
        sections.push({
          heading: currentHeading,
          text: currentLines.join('\n')
        });
        currentLines = [];
      }
      currentHeading = line.replace(/^[#*_~<>\s\-\d\.]+|[#*_~<>:\s]+$/g, '').trim();
    }
    currentLines.push(line);
  }

  if (currentLines.length > 0) {
    sections.push({
      heading: currentHeading,
      text: currentLines.join('\n')
    });
  }

  const boundedSections = [];
  for (const sec of sections) {
    if (sec.text.length <= maxChunkSize) {
      boundedSections.push(sec);
    } else {
      const paragraphs = sec.text.split(/\n\s*\n/);
      let subText = '';
      let subIdx = 1;
      for (const p of paragraphs) {
        if (subText.length + p.length + 2 > maxChunkSize && subText.length > 0) {
          boundedSections.push({
            heading: `${sec.heading} (part ${subIdx++})`,
            text: subText.trim()
          });
          subText = '';
        }
        subText = subText ? `${subText}\n\n${p}` : p;
      }
      if (subText.trim()) {
        boundedSections.push({
          heading: subIdx > 1 ? `${sec.heading} (part ${subIdx})` : sec.heading,
          text: subText.trim()
        });
      }
    }
  }

  return boundedSections;
}

function extractRequirementsFromSection(text = '') {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const requirements = [];
  const seenSkillNames = new Set();

  let inQualificationSection = false;
  let sectionIsPreferred = false;
  let inBenefitSection = false;

  for (const rawLine of lines) {
    const isBullet = /^[•\-\*\d+\.]\s+/.test(rawLine);
    const stripped = rawLine.replace(/^[#*_~<>\s\-\d\.]+|[#*_~<>:\s]+$/g, '').trim();

    if (!isBullet) {
      if (endSectionRegex.test(stripped)) {
        inQualificationSection = false;
        inBenefitSection = false;
        sectionIsPreferred = false;
        continue;
      }

      if (benefitSectionRegex.test(stripped)) {
        inBenefitSection = true;
        inQualificationSection = false;
        sectionIsPreferred = false;
        continue;
      }

      if (preferredSectionRegex.test(stripped)) {
        inQualificationSection = true;
        inBenefitSection = false;
        sectionIsPreferred = true;
        continue;
      }

      if (qualSectionRegex.test(stripped)) {
        inQualificationSection = true;
        inBenefitSection = false;
        sectionIsPreferred = false;
        continue;
      }
    }

    if (inBenefitSection) {
      const cleanLine = rawLine.replace(/^[\s#*•\-\d\.]+\s*/, '').replace(/<[^>]+>/g, '').trim();
      if (cleanLine.length >= 5 && cleanLine.length <= 300 && isBullet) {
        requirements.push({
          kind: 'other',
          value: cleanLine,
          mandatory: false,
          evidence: cleanLine,
          requirement_class: 'benefit',
          quote: cleanLine
        });
        if (requirements.length >= 25) break;
      }
      continue;
    }

    if (inQualificationSection) {
      const cleanLine = rawLine.replace(/^[\s#*•\-\d\.]+\s*/, '').replace(/<[^>]+>/g, '').trim();

      if (cleanLine.length < 5 || cleanLine.length > 300) continue;

      const isLineExplicitPreferred = explicitPreferredRegex.test(cleanLine);
      const isLineExplicitMandatory = explicitMandatoryRegex.test(cleanLine);
      const isSoft = softSkillRegex.test(cleanLine) || /^good to have\b/i.test(cleanLine) || /^nice to have\b/i.test(cleanLine);

      // Hackathon Participation / Eligibility Rules
      if (eligibilityRuleRegex.test(cleanLine)) {
        const isPref = sectionIsPreferred || isLineExplicitPreferred;
        const reqClass = isPref ? 'other_requirement' : 'mandatory_eligibility';
        requirements.push({
          kind: 'other',
          value: cleanLine,
          mandatory: reqClass === 'mandatory_eligibility',
          evidence: cleanLine,
          requirement_class: reqClass,
          quote: cleanLine
        });
      } else if (isSoft) {
        // NEVER classify general soft-skill bullets or "Good to Have: ..." as mandatory_eligibility
        const reqClass = (sectionIsPreferred || isLineExplicitPreferred) ? 'preferred_skill' : 'other_requirement';
        requirements.push({
          kind: 'other',
          value: cleanLine,
          mandatory: false,
          evidence: cleanLine,
          requirement_class: reqClass,
          quote: cleanLine
        });
      } else {
        const skillsInLine = extractSkillsFromText(cleanLine);
        if (skillsInLine.length > 0) {
          for (const skill of skillsInLine) {
            if (!seenSkillNames.has(skill.toLowerCase())) {
              const isPref = sectionIsPreferred || isLineExplicitPreferred;
              const isMand = !isPref && (isLineExplicitMandatory || isBullet);
              const reqClass = isPref ? 'preferred_skill' : (isMand ? 'required_skill' : 'preferred_skill');
              let skillVal = skill;
              if (!cleanLine.toLowerCase().includes(skill.toLowerCase())) {
                const pat = CANONICAL_SKILL_PATTERNS.find(p => p.name.toLowerCase() === skill.toLowerCase())?.pattern;
                const m = pat ? cleanLine.match(pat) : null;
                if (m) skillVal = m[0];
              }
              requirements.push({
                kind: 'skill',
                value: skillVal,
                mandatory: reqClass === 'required_skill',
                evidence: cleanLine,
                requirement_class: reqClass,
                quote: cleanLine
              });
              seenSkillNames.add(skill.toLowerCase());
            }
          }
        } else {
          // Non-skill criteria: degree, cgpa, graduation_year, academic_year, branch, location, other
          let kind = 'other';
          let val = cleanLine;
          const mandatory = !sectionIsPreferred && !isLineExplicitPreferred && (isLineExplicitMandatory || isBullet);

          if (/\b(?:degree|b\.?tech|b\.?e\.?|m\.?tech|bca|mca|bachelor|master|diploma)\b/i.test(cleanLine)) {
            kind = 'degree';
            const cleanVal = cleanLine.replace(/^(?:degree|must\s+be\s+enrolled\s+in(?:\s+an?)?|enrolled\s+in(?:\s+an?)?)\s*[:–-]?\s*/i, '').replace(/[.,;]+$/, '').trim();
            val = cleanVal || cleanLine;
          } else if (/\b(?:cgpa|gpa|percentage|marks)\b/i.test(cleanLine)) {
            kind = 'cgpa';
            const cgpaMatch = cleanLine.match(/\b([1-9](?:\.\d+)?)\b/);
            if (cgpaMatch) val = cgpaMatch[1];
          } else if (/\b(?:batch|graduat(?:ing|ion)|class of|passout)\b/i.test(cleanLine)) {
            const gradMatch = cleanLine.match(/\b(20\d{2})\b/);
            if (gradMatch) {
              kind = 'graduation_year';
              val = gradMatch[1];
            } else {
              kind = 'academic_year';
            }
          } else if (/\b(?:computer science|information technology|electronics|mechanical|electrical|civil|branch)\b/i.test(cleanLine)) {
            kind = 'branch';
            const cleanVal = cleanLine.replace(/^(?:branch|major|field(?:\s+of\s+study)?)\s*[:–-]?\s*/i, '').replace(/[.,;]+$/, '').trim();
            val = cleanVal || cleanLine;
          } else if (/\b(?:location|relocat|remote|hybrid|office|bangalore|bengaluru|pune|hyderabad|mumbai|delhi|noida|gurugram|chennai)\b/i.test(cleanLine)) {
            kind = 'location';
          }

          const reqClass = mandatory ? 'mandatory_eligibility' : 'other_requirement';

          requirements.push({
            kind,
            value: val,
            mandatory,
            evidence: cleanLine,
            requirement_class: reqClass,
            quote: cleanLine
          });
        }
      }

      if (requirements.length >= 25) break;
    }
  }

  // Fallback / Comprehensive check: Explicitly extract all technical skills present in text
  const allTechnicalSkills = extractSkillsFromText(text);
  for (const skill of allTechnicalSkills) {
    if (!seenSkillNames.has(skill.toLowerCase())) {
      const pattern = CANONICAL_SKILL_PATTERNS.find(p => p.name.toLowerCase() === skill.toLowerCase())?.pattern;
      const matchingLine = lines.find(l => pattern && pattern.test(l)) || text.slice(0, 100);
      const cleanLine = matchingLine.replace(/^[\s#*•\-\d\.]+\s*/, '').replace(/<[^>]+>/g, '').trim();
      const isPref = explicitPreferredRegex.test(cleanLine) || preferredSectionRegex.test(cleanLine);
      const isMand = !isPref && explicitMandatoryRegex.test(cleanLine);
      const reqClass = isMand ? 'required_skill' : 'preferred_skill';
      let skillVal = skill;
      if (!cleanLine.toLowerCase().includes(skill.toLowerCase())) {
        const m = pattern ? cleanLine.match(pattern) : null;
        if (m) skillVal = m[0];
      }
      requirements.push({
        kind: 'skill',
        value: skillVal,
        mandatory: reqClass === 'required_skill',
        evidence: cleanLine || text.slice(0, 200),
        requirement_class: reqClass,
        quote: cleanLine || text.slice(0, 200)
      });
      seenSkillNames.add(skill.toLowerCase());
      if (requirements.length >= 30) break;
    }
  }

  return requirements;
}

function extractRequirementsFlexible(sectionText = '') {
  if (!sectionText || typeof sectionText !== 'string') return [];
  const lines = sectionText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const requirements = [];
  const seenSkillNames = new Set();
  const seenQuotes = new Set();

  for (const rawLine of lines) {
    const stripped = rawLine.replace(/^[#*_~<>\s\-\d\.]+|[#*_~<>:\s]+$/g, '').trim();
    if (!stripped) continue;
    if (qualSectionRegex.test(stripped) || endSectionRegex.test(stripped) || benefitSectionRegex.test(stripped) || HEADING_LINE_REGEX.test(stripped)) {
      continue;
    }

    const cleanLine = rawLine.replace(/^[\s#*•\-\d\.]+\s*/, '').replace(/<[^>]+>/g, '').trim();
    if (cleanLine.length < 5 || cleanLine.length > 500) continue;

    const qKey = cleanLine.toLowerCase();
    if (seenQuotes.has(qKey)) continue;

    const isSoft = softSkillRegex.test(cleanLine) || /^good to have\b/i.test(cleanLine) || /^nice to have\b/i.test(cleanLine);
    const isPref = explicitPreferredRegex.test(cleanLine);
    const isMand = !isPref && (explicitMandatoryRegex.test(cleanLine) || eligibilityRuleRegex.test(cleanLine) || /\b(?:eligible|eligibility|only|participants?|teams?|submit)\b/i.test(cleanLine));

    if (eligibilityRuleRegex.test(cleanLine)) {
      requirements.push({
        kind: 'other',
        value: cleanLine,
        mandatory: !isPref,
        evidence: cleanLine,
        requirement_class: isPref ? 'other_requirement' : 'mandatory_eligibility',
        quote: cleanLine
      });
      seenQuotes.add(qKey);
    } else if (isSoft) {
      requirements.push({
        kind: 'other',
        value: cleanLine,
        mandatory: false,
        evidence: cleanLine,
        requirement_class: isPref ? 'preferred_skill' : 'other_requirement',
        quote: cleanLine
      });
      seenQuotes.add(qKey);
    } else {
      const skillsInLine = extractSkillsFromText(cleanLine);
      if (skillsInLine.length > 0) {
        for (const skill of skillsInLine) {
          if (!seenSkillNames.has(skill.toLowerCase())) {
            const reqClass = isPref ? 'preferred_skill' : 'required_skill';
            let skillVal = skill;
            if (!cleanLine.toLowerCase().includes(skill.toLowerCase())) {
              const pat = CANONICAL_SKILL_PATTERNS.find(p => p.name.toLowerCase() === skill.toLowerCase())?.pattern;
              const m = pat ? cleanLine.match(pat) : null;
              if (m) skillVal = m[0];
            }
            requirements.push({
              kind: 'skill',
              value: skillVal,
              mandatory: reqClass === 'required_skill',
              evidence: cleanLine,
              requirement_class: reqClass,
              quote: cleanLine
            });
            seenSkillNames.add(skill.toLowerCase());
            seenQuotes.add(qKey);
          }
        }
      } else {
        let kind = 'other';
        let val = cleanLine;
        if (/\b(?:degree|b\.?tech|b\.?e\.?|m\.?tech|bca|mca|bachelor|master|diploma|enrolled|university|student)\b/i.test(cleanLine)) {
          kind = 'degree';
        } else if (/\b(?:cgpa|gpa|percentage|marks)\b/i.test(cleanLine)) {
          kind = 'cgpa';
          const m = cleanLine.match(/\b([1-9](?:\.\d+)?)\b/);
          if (m) val = m[1];
        } else if (/\b(?:batch|graduat(?:ing|ion)|class of|passout)\b/i.test(cleanLine)) {
          kind = 'graduation_year';
          const m = cleanLine.match(/\b(20\d{2})\b/);
          if (m) val = m[1];
        } else if (/\b(?:location|relocat|remote|hybrid|office|bangalore|bengaluru|pune|hyderabad|mumbai|delhi|noida|gurugram|chennai)\b/i.test(cleanLine)) {
          kind = 'location';
        }

        requirements.push({
          kind,
          value: val,
          mandatory: isMand,
          evidence: cleanLine,
          requirement_class: isMand ? 'mandatory_eligibility' : 'other_requirement',
          quote: cleanLine
        });
        seenQuotes.add(qKey);
      }
    }

    if (requirements.length >= 25) break;
  }

  return requirements;
}

export function extractRequirementsFromText(text = '') {
  if (!text || typeof text !== 'string') return [];

  if (text.length > 20000) {
    const sections = chunkListingByHeadings(text);
    const allReqs = [];
    const seenQuotes = new Set();
    for (const section of sections) {
      let reqs = extractRequirementsFromSection(section.text);
      const isReqHeader = qualSectionRegex.test(section.heading) || /^(?:qualifications|requirements|eligibility|who\s+can\s+participate|rules|participation|what\s+to\s+build)/i.test(section.heading);
      if (isReqHeader && reqs.length === 0) {
        reqs = extractRequirementsFlexible(section.text);
      }
      for (const r of reqs) {
        const qKey = (r.quote || r.evidence || '').toLowerCase().trim();
        if (!seenQuotes.has(qKey)) {
          seenQuotes.add(qKey);
          allReqs.push(r);
          if (allReqs.length >= 30) break;
        }
      }
      if (allReqs.length >= 30) break;
    }
    return allReqs;
  }

  let reqs = extractRequirementsFromSection(text);
  const isReqHeader = qualSectionRegex.test(text) || /\b(?:qualifications?|requirements?|eligibility|who\s+can\s+participate|rules|participation\s+rules)\b/i.test(text);
  if (isReqHeader && reqs.length === 0) {
    reqs = extractRequirementsFlexible(text);
  }
  return reqs;
}

const MONTH_MAP = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

function formatIsoDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dt = new Date(iso + 'T00:00:00Z');
  if (!Number.isFinite(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

export function extractDeadline(text = '') {
  if (!text || typeof text !== 'string') return null;

  const isExcludedContext = (snippet) => {
    return /\b(?:starts?\s+on|hackathon\s+starts?|event\s+starts?|start\s+date|opening\s+ceremony|kickoff|begins?\s+on|posted\s+on|date\s+posted|published\s+on|winners?\s+announced?|results?\s+announced?|judging\s+period)\b/i.test(snippet) &&
      !/\b(?:submission|deadline|closes?|due|submit\s+by|apply\s+by)\b/i.test(snippet);
  };

  const parseDateFromLine = (line) => {
    // 1. ISO format: 2026-10-27T09:00:00-04:00 or 2026-10-27
    const isoMatch = line.match(/\b(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}:\d{2}(?::\d{2})?)\s*([+-]\d{2}:?\d{2}|Z))?\b/i);
    if (isoMatch) {
      const d = formatIsoDate(isoMatch[1], isoMatch[2], isoMatch[3]);
      if (d) return { deadline: d, time: isoMatch[4] || null, timezone: isoMatch[5] || null };
    }

    // 2. Month Day Year (including range like "Oct 05 - 27, 2026", "Oct 27, 2026 @ 1:00pm UTC")
    const mdyMatch = line.match(/\b([a-z]{3,9})[\s,/-]+(?:(\d{1,2})(?:st|nd|rd|th)?[\s,/-]*(?:-|–|—|to)[\s,/-]*(?:[a-z]{3,9}[\s,/-]+)?)?(\d{1,2})(?:st|nd|rd|th)?[\s,/-]+(\d{4})(?:\s*(?:@|at|,)?\s*(\d{1,2}(?::\d{2})?(?::\d{2})?\s*(?:am|pm)?))?(?:\s+([a-z]{2,5}|[+-]\d{2}:?\d{2}))?\b/i);
    if (mdyMatch) {
      const month = MONTH_MAP[mdyMatch[1].toLowerCase()];
      if (month) {
        const d = formatIsoDate(mdyMatch[4], month, mdyMatch[3]);
        if (d) return { deadline: d, time: mdyMatch[5] || null, timezone: mdyMatch[6] || null };
      }
    }

    // 3. Day Month Year (e.g. "20 October 2026", "27th Oct 2026 @ 1:00pm UTC", "05 - 27 Oct 2026")
    const dmyMatch = line.match(/\b(?:(\d{1,2})(?:st|nd|rd|th)?[\s,/-]*(?:-|–|—|to)[\s,/-]*)?(\d{1,2})(?:st|nd|rd|th)?[\s,/-]+([a-z]{3,9})[\s,/-]+(\d{4})(?:\s*(?:@|at|,)?\s*(\d{1,2}(?::\d{2})?(?::\d{2})?\s*(?:am|pm)?))?(?:\s+([a-z]{2,5}|[+-]\d{2}:?\d{2}))?\b/i);
    if (dmyMatch) {
      const month = MONTH_MAP[dmyMatch[3].toLowerCase()];
      if (month) {
        const d = formatIsoDate(dmyMatch[4], month, dmyMatch[2]);
        if (d) return { deadline: d, time: dmyMatch[5] || null, timezone: dmyMatch[6] || null };
      }
    }

    return null;
  };

  // Phase 1: Search targeted explicit deadline clauses across the text
  const explicitRegex = /\b(?:(?:submission|project|application|registration)?\s*deadlines?|last\s+date(?:\s+(?:to\s+apply|for\s+(?:applications?|registration|submissions?)))?|closing\s+date|(?:applications?|submissions?|registrations?)\s+(?:closes?|due)|(?:apply|register|submit)\s+by|due\s+date|(?:closes?|ends?)\s+(?:on|at))\s*[:–-]?\s*(?:(?:is|on|by|at)\s+)?([^\n.;]+)/gi;
  for (const match of text.matchAll(explicitRegex)) {
    const candidateSnippet = match[0].trim();
    if (isExcludedContext(candidateSnippet)) continue;
    const parsed = parseDateFromLine(candidateSnippet);
    if (parsed) {
      return {
        deadline: parsed.deadline,
        quote: candidateSnippet,
        time: parsed.time,
        timezone: parsed.timezone
      };
    }
  }

  // Phase 2: Search sentence/line segments
  const segments = text.split(/(?:\r?\n|;\s*|\.\s+(?=[A-Z#•\-\*]))/).map(s => s.trim()).filter(Boolean);
  for (const seg of segments) {
    if (isExcludedContext(seg)) continue;
    if (/\b(?:(?:submission|project|application|registration)?\s*deadlines?|last\s+date|closing\s+date|closes?|due|submit\s+by|apply\s+by)\b/i.test(seg)) {
      const parsed = parseDateFromLine(seg);
      if (parsed) {
        return {
          deadline: parsed.deadline,
          quote: seg,
          time: parsed.time,
          timezone: parsed.timezone
        };
      }
    }
  }

  // Phase 3: Look for hackathon date ranges (taking end date)
  const rangeRegex = /\b(?:(?:hackathon|event)\s+dates?|dates?|runs?|period)?\s*[:–-]?\s*([a-z]{3,9}[\s,/-]+\d{1,2}(?:st|nd|rd|th)?[\s,/-]*(?:-|–|—|to)[\s,/-]*(?:[a-z]{3,9}[\s,/-]+)?\d{1,2}(?:st|nd|rd|th)?[\s,/-]+\d{4})\b/gi;
  for (const match of text.matchAll(rangeRegex)) {
    const candidateSnippet = match[0].trim();
    if (isExcludedContext(candidateSnippet)) continue;
    const parsed = parseDateFromLine(candidateSnippet);
    if (parsed) {
      return {
        deadline: parsed.deadline,
        quote: candidateSnippet,
        time: parsed.time,
        timezone: parsed.timezone
      };
    }
  }

  return null;
}

export function extractSkillsAndRequirements(text = '') {
  const skills = extractSkillsFromText(text);
  const requirements = extractRequirementsFromText(text);
  const deadlineInfo = extractDeadline(text);

  let requirements_status = 'NO_REQUIREMENTS_STATED';
  if (requirements.length > 0) {
    requirements_status = 'REQUIREMENTS_PRESENT';
  } else {
    const statesReqs = /\b(?:qualifications?|requirements?|required\s+skills?|technical\s+skills?|what\s+we\s+are\s+looking\s+for|who\s+you\s+are|what\s+you\s+bring|basic\s+qualifications|minimum\s+qualifications|eligibility|who\s+can\s+participate|rules|participation\s+rules|must[- ]haves?|minimum\s+cgpa|b\.?tech|b\.?e\.?|graduation\s+year|class\s+of|batch\s+of)\b/i.test(text) ||
      /\b(?:python|javascript|typescript|react|node(?:\.js)?|java|c\+\+|c#|sql|html|css|docker|aws|git|mongodb|postgresql)\b/i.test(text);
    if (statesReqs) {
      requirements_status = 'EXTRACTION_INCOMPLETE';
    } else {
      requirements_status = 'NO_REQUIREMENTS_STATED';
    }
  }

  return {
    skills,
    requirements,
    deadline: deadlineInfo?.deadline || null,
    deadline_quote: deadlineInfo?.quote || null,
    deadline_time: deadlineInfo?.time || null,
    deadline_timezone: deadlineInfo?.timezone || null,
    requirements_status
  };
}

