import {createHash} from 'node:crypto';
import {extractSkillsAndRequirements} from './skill-extractor.mjs';

export function hashString(str) {
  return createHash('sha256').update(String(str || '')).digest('hex');
}

export function htmlToCleanText(html = '') {
  if (!html) return '';
  let source = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(?:div|section|aside)\b[^>]*(?:id|class)=["'][^"']*\b(?:advertisement|banner-ad|ad-container|adsbygoogle)\b[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section|aside)>/gi, ' ');

  let text = source
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));

  // Convert headings to Markdown
  text = text.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n### $1\n\n');
  // Convert list items to Markdown bullets
  text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '\n- $1');
  // Convert paragraphs and line breaks
  text = text.replace(/<p[^>]*>/gi, '\n\n');
  text = text.replace(/<\/p>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Clean whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n\s*\n+/g, '\n\n');
  return text.trim();
}

export function isIndiaOrRemoteLocation(location = '') {
  if (!location) return true;
  const normLoc = String(location).toLowerCase();
  const isForeign = /\b(?:united states|usa|us\b|uk\b|united kingdom|london|san francisco|sf\b|seattle|austin|dublin|ireland|germany|berlin|france|paris|canada|toronto|vancouver|australia|sydney|singapore|tokyo|japan)\b/i.test(normLoc);
  const isIndia = /\b(?:india|in\b|bengaluru|bangalore|hyderabad|pune|mumbai|delhi|noida|gurgaon|gurugram|chennai|kolkata|ahmedabad|karnataka|maharashtra|telangana|tamil\s*nadu|haryana|remote|worldwide|anywhere)\b/i.test(normLoc);
  return isIndia && !isForeign;
}

export function detectRiskSignals(text = '') {
  const content = String(text || '');
  const signals = [];

  // Match fee requirements only when NOT preceded by negative context (e.g. "no application fee", "zero registration fee", "free of fees")
  const feePattern = /(?<!\b(?:no|zero|without|free\s+of|free\s+from)\s+)(?:registration\s+fee|processing\s+fee|application\s+fee|training\s+fee|security\s+deposit|pay\s+\$?\d+|send\s+money)\b/i;
  const feeMatch = content.match(feePattern);
  if (feeMatch) {
    // Context check around the match to protect against phrases like "no application fee is required"
    const start = Math.max(0, feeMatch.index - 25);
    const end = Math.min(content.length, feeMatch.index + feeMatch[0].length + 25);
    const window = content.slice(start, end);
    const isExempt = /\b(?:no|zero|without|free|waived)\s+(?:registration|processing|application|training)?\s*fee/i.test(window) ||
                     /\b(?:free\s+to\s+apply|free\s+to\s+participate|no\s+fee)\b/i.test(window);
    if (!isExempt) {
      signals.push(`fee_payment_required: "${feeMatch[0]}"`);
    }
  }

  const credentialMatch = content.match(/\b(?:send\s+(?:your\s+)?(?:password|bank\s+account|credit\s+card|cvv|otp))\b/i);
  if (credentialMatch) {
    signals.push(`credential_request: "${credentialMatch[0]}"`);
  }

  const injectionMatch = content.match(/\b(?:ignore\s+(?:all\s+)?(?:previous\s+)?instructions|system\s+prompt|override\s+(?:all\s+)?policies|mark\s+as\s+act|eval:\s*act)\b/i);
  if (injectionMatch) {
    signals.push(`prompt_injection_detected: "${injectionMatch[0]}"`);
  }

  return signals;
}

export function classifySeniority(title = '', commitment = '') {
  const combined = `${title} ${commitment}`.toLowerCase();
  
  if (/\b(?:intern|internship|trainee|apprentice|fellow|fellowship)\b/i.test(combined)) {
    return 'intern';
  }
  
  const hasExec = /\b(?:director|vice president|vp\b|chief|head of|general manager|partner\b)/i.test(combined);
  if (hasExec) {
    return 'executive';
  }
  
  const hasSenior = /\b(?:senior|sr\.?\b|lead\b|principal\b|staff\b|manager|architect|mgr\b)/i.test(combined);
  
  const hasEntry = /\b(?:junior|jr\.?\b|entry[- ]level|graduate engineer|fresher|associate (?:software|engineer|developer|consultant|analyst|qa|tester|product))\b/i.test(combined)
    || (/\bassociate\b/i.test(combined) && !hasSenior && !hasExec);

  if (hasEntry && !hasSenior) {
    return 'entry';
  }
  
  if (hasSenior) {
    return 'senior';
  }
  
  if (/\b(?:software engineer|developer|analyst|specialist|designer|consultant)\b/i.test(combined)) {
    return 'mid';
  }
  
  return 'uncertain';
}

export function buildStructuredRequirements(extractedReqs = [], extractedSkills = [], rawText = '') {
  const reqs = [];
  const seenSkills = new Set();

  for (const r of extractedReqs || []) {
    let reqClass = r.requirement_class;
    if (!reqClass) {
      if (r.kind === 'skill') {
        reqClass = r.mandatory ? 'required_skill' : 'preferred_skill';
      } else if (['degree', 'cgpa', 'academic_year', 'branch'].includes(r.kind)) {
        reqClass = 'mandatory_eligibility';
      } else {
        reqClass = r.mandatory ? 'mandatory_eligibility' : 'other_requirement';
      }
    }

    let evidence = r.evidence || r.evidence_snippet || r.value || '';
    if (!rawText.includes(evidence)) {
      const lines = rawText.split(/\r?\n/);
      const matchLine = lines.find(l => (evidence && l.includes(evidence)) || (r.value && l.includes(r.value)));
      if (matchLine && matchLine.trim()) {
        evidence = matchLine.trim();
      } else if (r.value && rawText.includes(r.value)) {
        evidence = r.value;
      } else {
        evidence = rawText.slice(0, 100);
      }
    }

    reqs.push({
      kind: r.kind || 'other',
      value: r.value,
      mandatory: Boolean(r.mandatory),
      requirement_class: reqClass,
      evidence,
      evidence_snippet: evidence
    });

    if (r.kind === 'skill') {
      seenSkills.add(r.value.toLowerCase());
    }
  }

  for (const skill of extractedSkills || []) {
    const skLower = skill.toLowerCase();
    const existing = reqs.find(
      r => r.kind === 'skill' && (r.value.toLowerCase() === skLower || r.value.toLowerCase().includes(skLower))
    );
    if (existing) {
      // A skill mentioned in a listing is not automatically a required skill.
      // Keep the classification supported by the requirement's quoted context.
    } else {
      let quote = '';
      const lines = rawText.split(/\r?\n/);
      for (const line of lines) {
        if (line.toLowerCase().includes(skLower)) {
          quote = line.trim();
          break;
        }
      }
      if (!quote || !rawText.includes(quote)) {
        const re = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        const m = rawText.match(re);
        if (m) quote = m[0];
        else {
          const idx = rawText.toLowerCase().indexOf(skLower);
          if (idx !== -1) quote = rawText.slice(idx, idx + skill.length);
        }
      }

      if (quote && rawText.includes(quote)) {
        reqs.push({
          kind: 'skill',
          value: skill,
          mandatory: false,
          requirement_class: 'preferred_skill',
          evidence: quote,
          evidence_snippet: quote
        });
      }
    }
  }

  return reqs;
}

export function normalizeLeverItem(company, item) {
  if (!item || !item.id || !item.text) {
    throw new Error('INVALID_LEVER_PAYLOAD: Missing id or title');
  }

  const title = String(item.text).trim();
  const location = item.categories?.location || item.categories?.allLocations?.join(', ') || null;
  const commitment = item.categories?.commitment || '';
  const team = item.categories?.team || item.categories?.department || null;
  const originalUrl = item.hostedUrl || `https://jobs.lever.co/${company}/${item.id}`;
  const applyUrl = item.applyUrl || `${originalUrl}/apply`;

  // Infer type: strictly job or internship
  const isIntern = /\b(?:intern|internship|trainee|apprentice)\b/i.test(title + ' ' + commitment);
  const type = isIntern ? 'internship' : 'job';

  // Preserve substantive posting descriptions, requirements, and lists
  const descParts = [
    item.descriptionPlain || (item.description ? htmlToCleanText(item.description) : ''),
    item.additionalPlain || '',
    Array.isArray(item.lists)
      ? item.lists.map(l => `${l.text || ''}:\n${htmlToCleanText(l.content || '')}`).join('\n')
      : ''
  ].filter(Boolean).join('\n\n');

  const rawTextParts = [
    title,
    `Organization: ${company.toUpperCase()}`,
    location ? `Location: ${location}` : '',
    commitment ? `Commitment: ${commitment}` : '',
    team ? `Team: ${team}` : '',
    descParts,
    `Apply: ${applyUrl}`
  ].filter(Boolean);

  const rawText = rawTextParts.join('\n');
  const riskSignals = detectRiskSignals(rawText);
  const trustTier = riskSignals.length > 0 ? 'unverified' : 'corroborated';
  const seniority = classifySeniority(title, commitment);
  const { skills: extractedSkills, requirements: extractedReqs } = extractSkillsAndRequirements(descParts);
  const structuredReqs = buildStructuredRequirements(extractedReqs, extractedSkills, rawText);
  const requirementsStatus = structuredReqs.length > 0 ? 'REQUIREMENTS_PRESENT' : 'NO_REQUIREMENTS_STATED';

  const evidence = [
    { field: 'title', quote: title },
    { field: 'organization', quote: company.toUpperCase() },
    { field: 'type', quote: isIntern ? (title.match(/\b(intern|internship|trainee|apprentice)\b/i)?.[0] || 'internship') : 'job' }
  ];
  if (location) {
    evidence.push({ field: 'location', quote: location });
  }
  if (extractedSkills.length > 0) {
    evidence.push({ field: 'skills', quote: extractedSkills.join(', ') });
    for (const sk of extractedSkills) {
      evidence.push({ field: 'skills', quote: sk });
    }
  }
  if (descParts) {
    evidence.push({ field: 'description', quote: descParts.slice(0, 500) });
  }

  return {
    contract_version: 'source-item-v2',
    visibility: 'public',
    source_kind: 'company_feed',
    adapter: 'lever-v1',
    external_id: String(item.id),
    title,
    organization: company.toUpperCase(),
    type,
    location,
    deadline: null, // Lever postings do not carry explicit closing dates
    original_url: originalUrl,
    application_url: applyUrl,
    trust_tier: trustTier,
    source_badge: `${company.toUpperCase()} Careers`,
    risk_signals: riskSignals,
    seniority_level: seniority,
    skills: extractedSkills,
    requirements: structuredReqs,
    requirements_status: requirementsStatus,
    evidence,
    content_hash: hashString(rawText),
    raw_text: rawText,
    fields: {
      title,
      organization: company.toUpperCase(),
      location,
      commitment,
      deadline: null,
      seniority_level: seniority,
      skills: extractedSkills,
      requirements: structuredReqs,
      requirements_status: requirementsStatus,
      evidence
    },
    field_provenance: [
      { field: 'title', kind: 'structured_field', json_pointer: '/text', value: title },
      { field: 'location', kind: 'structured_field', json_pointer: '/categories/location', value: location },
      { field: 'apply_url', kind: 'structured_field', json_pointer: '/applyUrl', value: applyUrl }
    ]
  };
}

export function parseDevpostDeadline(datesStr, returnDetails = false) {
  if (!datesStr || typeof datesStr !== 'string') return null;
  const str = datesStr.trim();
  if (!str) return null;

  const months = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
    apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
    aug: 7, august: 7, sep: 8, sept: 8, september: 8,
    oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
  };

  const tzOffsets = {
    utc: 0, gmt: 0, z: 0,
    est: -300, edt: -240,
    cst: -360, cdt: -300,
    mst: -420, mdt: -360,
    pst: -480, pdt: -420,
    akst: -540, akdt: -480,
    hst: -600,
    ist: 330, bst: 60,
    cet: 60, cest: 120,
    eet: 120, eest: 180,
    jst: 540, kst: 540,
    sgt: 480, hkt: 480,
    aedt: 660, aest: 600,
    nzst: 720, nzdt: 780
  };

  // Clean common prefixes
  const cleanStr = str.replace(/^(?:deadline|submissions?\s+(?:close|period)|ends?)\s*[:\-–—]?\s*/i, '').trim();

  // 1. Direct ISO 8601 match (e.g. 2026-10-27T09:00:00-04:00, 2026-10-27T13:00:00Z, 2026-10-27)
  const isoMatch = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?([+-]\d{2}:?\d{2}|Z)?)?/i);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const mo = parseInt(isoMatch[2], 10) - 1;
    const d = parseInt(isoMatch[3], 10);
    const testDate = new Date(Date.UTC(y, mo, d));
    if (testDate.getUTCFullYear() !== y || testDate.getUTCMonth() !== mo || testDate.getUTCDate() !== d) return null;
    const dateStr = testDate.toISOString().slice(0, 10);

    if (isoMatch[4] !== undefined) {
      const dt = new Date(cleanStr);
      if (!isNaN(dt.getTime())) {
        if (!returnDetails) return dateStr;
        return {
          date: dateStr,
          time: dt.toISOString().slice(11, 19) + 'Z',
          iso: dt.toISOString(),
          display: str
        };
      }
    }
    if (!returnDetails) return dateStr;
    return {
      date: dateStr,
      time: null,
      iso: testDate.toISOString(),
      display: str
    };
  }

  // 2. Date ranges or single dates
  let targetStr = cleanStr;
  const dashIdx = cleanStr.search(/[-–—]/);
  if (dashIdx !== -1) {
    const left = cleanStr.slice(0, dashIdx).trim();
    const right = cleanStr.slice(dashIdx + 1).trim();
    const monthRegex = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;
    if (!monthRegex.test(right)) {
      const leftMonthMatch = left.match(monthRegex);
      if (leftMonthMatch) {
        targetStr = leftMonthMatch[0] + ' ' + right;
      } else {
        targetStr = right;
      }
    } else {
      targetStr = right;
    }
  }

  // Match month, day, year and optional time
  const dateMatch = targetStr.match(/([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,\s*(\d{4})(.*)$/i);
  if (!dateMatch) return null;

  const [_, monthName, dayStr, yearStr, timePart = ''] = dateMatch;
  const mo = months[monthName.toLowerCase()];
  if (mo === undefined) return null;
  const d = parseInt(dayStr, 10);
  const y = parseInt(yearStr, 10);
  if (y < 2000 || y > 2100) return null;

  const testDate = new Date(Date.UTC(y, mo, d));
  if (testDate.getUTCFullYear() !== y || testDate.getUTCMonth() !== mo || testDate.getUTCDate() !== d) {
    return null;
  }
  const dateStr = testDate.toISOString().slice(0, 10);

  // Time parsing if present
  const timeMatch = timePart.match(/(?:@|at)?\s*(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)?(?:\s*([A-Za-z]{2,5}|[+-]\d{2}:?\d{2}))?/i);
  if (timeMatch && (timeMatch[1] !== undefined && (timeMatch[2] !== undefined || timeMatch[4] !== undefined))) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const second = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
    const ampm = timeMatch[4] ? timeMatch[4].toLowerCase() : null;
    const tzStr = timeMatch[5] ? timeMatch[5].toLowerCase() : 'utc';

    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    let offsetMinutes = 0;
    if (tzOffsets[tzStr] !== undefined) {
      offsetMinutes = tzOffsets[tzStr];
    } else {
      const numMatch = tzStr.match(/^([+-])(\d{1,2}):?(\d{2})?$/);
      if (numMatch) {
        const sign = numMatch[1] === '+' ? 1 : -1;
        const h = parseInt(numMatch[2], 10);
        const m = numMatch[3] ? parseInt(numMatch[3], 10) : 0;
        offsetMinutes = sign * (h * 60 + m);
      }
    }

    const utcMs = Date.UTC(y, mo, d, hour, minute, second) - (offsetMinutes * 60 * 1000);
    const dt = new Date(utcMs);
    if (!returnDetails) return dateStr;
    return {
      date: dateStr,
      time: dt.toISOString().slice(11, 19) + 'Z',
      iso: dt.toISOString(),
      display: str
    };
  }

  if (!returnDetails) return dateStr;
  return {
    date: dateStr,
    time: null,
    iso: testDate.toISOString(),
    display: str
  };
}

export function parseDevpostDeadlineDetails(datesStr) {
  return parseDevpostDeadline(datesStr, true);
}

export function extractDevpostPageElements(pageHtmlOrText = '') {
  const isHtml = /<[a-z][\s\S]*>/i.test(pageHtmlOrText);
  let deadlineStr = null;
  let isoDate = null;
  let datesText = null;
  const eligibilityList = [];
  let prizesStr = null;
  let rulesStr = null;
  let descriptionStr = null;

  if (isHtml) {
    const isoDateMatch = pageHtmlOrText.match(/data-iso-date=["']([^"']+)["']/i);
    const timeMatch = pageHtmlOrText.match(/<time[^>]*datetime=["']([^"']+)["'][^>]*>/i);
    const datesTextMatch = pageHtmlOrText.match(/data-dates-text(?:=["']([^"']+)["']|>([^<]+)<\/)/i);
    const textDeadlineMatch = pageHtmlOrText.match(/(?:deadline|submission\s+deadline|submissions?\s+close)\s*[:\-–—]?\s*([^<\n\r]+)/i);

    if (isoDateMatch) {
      isoDate = isoDateMatch[1].trim();
      deadlineStr = isoDate;
    } else if (timeMatch) {
      isoDate = timeMatch[1].trim();
      deadlineStr = isoDate;
    }

    if (datesTextMatch) {
      datesText = (datesTextMatch[1] || datesTextMatch[2]).trim();
      if (!deadlineStr) deadlineStr = datesText;
    } else if (textDeadlineMatch) {
      deadlineStr = textDeadlineMatch[1].trim();
    }

    const eligListMatch = pageHtmlOrText.match(/<(?:ul|ol|div)[^>]*id=["']eligibility-list["'][^>]*>([\s\S]*?)<\/(?:ul|ol|div)>/i);
    if (eligListMatch) {
      const liMatches = eligListMatch[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi);
      for (const m of liMatches) {
        let text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (/countries\/territories excluded/i.test(text)) {
          text = 'Specific countries/territories excluded';
        }
        if (text) eligibilityList.push(text);
      }
    }

    if (eligibilityList.length === 0) {
      const whoMatch = pageHtmlOrText.match(/<(?:h[1-6]|strong|b)[^>]*>\s*(?:Who can participate\??|Eligibility)\s*<\/(?:h[1-6]|strong|b)>([\s\S]*?)(?=<(?:h[1-6]|section\b|footer\b)|$)/i);
      if (whoMatch) {
        const liMatches = whoMatch[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi);
        for (const m of liMatches) {
          const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          if (text) eligibilityList.push(text);
        }
      }
    }

    if (pageHtmlOrText.includes('Specific countries/territories excluded') && !eligibilityList.some(e => e.includes('Specific countries/territories excluded'))) {
      eligibilityList.push('Specific countries/territories excluded');
    }

    const prizesArticleMatch = pageHtmlOrText.match(/<article[^>]*id=["']prizes["'][^>]*>([\s\S]*?)<\/article>/i);
    const prizesOverviewMatch = pageHtmlOrText.match(/<div[^>]*id=["']prizes-overview["'][^>]*>([\s\S]*?)<\/div>/i);
    if (prizesOverviewMatch) {
      prizesStr = htmlToCleanText(prizesOverviewMatch[1]);
    } else if (prizesArticleMatch) {
      prizesStr = htmlToCleanText(prizesArticleMatch[1]);
    }

    const rulesArticleMatch = pageHtmlOrText.match(/<article[^>]*id=["'](?:rules|challenge-rules)["'][^>]*>([\s\S]*?)<\/article>/i);
    if (rulesArticleMatch) {
      rulesStr = htmlToCleanText(rulesArticleMatch[1]);
    }

    const descArticleMatch = pageHtmlOrText.match(/<article[^>]*id=["'](?:challenge-description|challenge-overview|overview)["'][^>]*>([\s\S]*?)<\/article>/i);
    if (descArticleMatch) {
      descriptionStr = htmlToCleanText(descArticleMatch[1]);
    }
  } else {
    const textDeadlineMatch = pageHtmlOrText.match(/(?:deadline|submission\s+deadline|submissions?\s+close)\s*[:\-–—]?\s*([^\n\r]+)/i);
    if (textDeadlineMatch) deadlineStr = textDeadlineMatch[1].trim();

    const whoMatch = pageHtmlOrText.match(/(?:Who can participate\??|Eligibility)\s*[:\-–—]?\s*\n([\s\S]*?)(?=\n\s*(?:Rules|Prizes|Schedule|Overview|###|$))/i);
    if (whoMatch) {
      const lines = whoMatch[1].split('\n').map(l => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
      eligibilityList.push(...lines);
    }
  }

  const cleanText = htmlToCleanText(pageHtmlOrText);
  return {
    deadlineStr,
    isoDate,
    datesText,
    eligibilityList,
    prizesStr,
    rulesStr,
    descriptionStr,
    cleanText
  };
}

export function normalizeDevpostItem(item) {
  if (!item || !item.id || !item.title) {
    throw new Error('INVALID_DEVPOST_PAYLOAD: Missing id or title');
  }

  const title = String(item.title).trim();
  const url = item.url || `https://devpost.com/hackathons/${item.id}`;

  // Extract from HTML or text if present
  let pageData = null;
  if (item.raw_html || item.page_text) {
    pageData = extractDevpostPageElements(item.raw_html || item.page_text);
  }

  const datesSource = item.submission_period_dates || item.deadline || pageData?.datesText || pageData?.isoDate || pageData?.deadlineStr;
  const deadlineDetails = parseDevpostDeadline(datesSource, true);
  const deadline = deadlineDetails ? deadlineDetails.date : null;
  const deadlineDisplay = pageData?.datesText || deadlineDetails?.display || datesSource;

  const prizes = item.prize_amount
    ? String(item.prize_amount).replace(/<[^>]*>/g, '').trim()
    : (pageData?.prizesStr || null);
  const location = item.displayed_location?.location || null;
  const description = item.description || pageData?.descriptionStr || null;
  const rules = item.rules || pageData?.rulesStr || null;

  // Gather eligibility rules
  const rawRules = [];
  if (Array.isArray(item.eligibility)) {
    rawRules.push(...item.eligibility);
  } else if (typeof item.eligibility === 'string') {
    rawRules.push(...item.eligibility.split(/\r?\n/).map(s => s.replace(/^[-*•]\s*/, '').trim()).filter(Boolean));
  }
  if (pageData?.eligibilityList?.length) {
    for (const r of pageData.eligibilityList) {
      if (!rawRules.includes(r)) rawRules.push(r);
    }
  }

  // If item.raw_html or item.page_text had participation rules embedded:
  if (rawRules.length === 0 && (item.raw_html || item.page_text)) {
    const content = item.raw_html || item.page_text;
    if (/Above legal age of majority in country of residence/i.test(content)) {
      rawRules.push('Above legal age of majority in country of residence');
    }
    if (/Specific countries\/territories excluded/i.test(content) || /countries\/territories excluded/i.test(content)) {
      rawRules.push('Specific countries/territories excluded');
    }
  }

  const rawTextParts = [
    `Hackathon: ${title}`,
    datesSource ? `Submission Period: ${datesSource}` : '',
    location ? `Location: ${location}` : '',
    prizes ? `Prizes: ${prizes}` : '',
    description ? `Description: ${description}` : '',
    rules ? `Rules: ${rules}` : '',
    rawRules.length > 0 ? `Who can participate:\n${rawRules.map(r => `- ${r}`).join('\n')}` : '',
    `URL: ${url}`
  ].filter(Boolean);

  const rawText = rawTextParts.join('\n');
  const riskSignals = detectRiskSignals(rawText);
  const trustTier = riskSignals.length > 0 ? 'unverified' : 'attributed';
  const { skills: extractedSkills } = extractSkillsAndRequirements(rawText);

  // Structured participation requirements for hackathons (no fake academic requirements)
  const devpostReqs = [];
  if (datesSource) {
    const subQuote = `Submission Period: ${datesSource}`;
    devpostReqs.push({
      kind: 'submission_window',
      value: `Submission window: ${datesSource}`,
      mandatory: true,
      requirement_class: 'mandatory_eligibility',
      evidence: subQuote,
      evidence_snippet: subQuote
    });
  }
  if (deadline) {
    const deadQuote = datesSource ? `Submission Period: ${datesSource}` : `Hackathon: ${title}`;
    devpostReqs.push({
      kind: 'deadline',
      value: `Submission deadline: ${deadline}`,
      mandatory: true,
      requirement_class: 'mandatory_eligibility',
      evidence: deadQuote,
      evidence_snippet: deadQuote
    });
  }
  if (location) {
    const locQuote = `Location: ${location}`;
    devpostReqs.push({
      kind: 'location',
      value: `Participation location: ${location}`,
      mandatory: false,
      requirement_class: 'other_requirement',
      evidence: locQuote,
      evidence_snippet: locQuote
    });
  }
  if (prizes) {
    const prizeQuote = `Prizes: ${prizes}`;
    devpostReqs.push({
      kind: 'prize',
      value: `Prizes: ${prizes}`,
      mandatory: false,
      requirement_class: 'benefit',
      evidence: prizeQuote,
      evidence_snippet: prizeQuote
    });
  }

  // Participation rules: Who can participate, age, location exclusions
  for (const rule of rawRules) {
    let kind = 'eligibility';
    if (/\b(?:age|majority)\b/i.test(rule)) {
      kind = 'eligibility';
    } else if (/countr|territor|excluded|jurisdiction|where prohibited|location/i.test(rule)) {
      kind = 'location';
    }
    const isMandatory = /mandatory|must|require|above legal age|excluded|only|eligible/i.test(rule) || true;
    devpostReqs.push({
      kind,
      value: rule,
      mandatory: isMandatory,
      requirement_class: isMandatory ? 'mandatory_eligibility' : 'other_requirement',
      evidence: rule,
      evidence_snippet: rule
    });
  }

  const structuredReqs = buildStructuredRequirements(devpostReqs, extractedSkills, rawText);
  const requirementsStatus = structuredReqs.length > 0 ? 'REQUIREMENTS_PRESENT' : 'NO_REQUIREMENTS_STATED';

  const evidence = [
    { field: 'title', quote: title },
    { field: 'organization', quote: 'Devpost Community' },
    { field: 'type', quote: `Hackathon: ${title}` }
  ];
  if (location) {
    evidence.push({ field: 'location', quote: location });
  }
  if (datesSource) {
    evidence.push({ field: 'deadline', quote: datesSource });
  }
  for (const rule of rawRules) {
    evidence.push({
      field: /countr|territor|excluded/i.test(rule) ? 'location' : 'requirements',
      quote: rule
    });
  }
  if (extractedSkills.length > 0) {
    evidence.push({ field: 'skills', quote: extractedSkills.join(', ') });
    for (const sk of extractedSkills) {
      evidence.push({ field: 'skills', quote: sk });
    }
  }
  if (prizes) {
    evidence.push({ field: 'description', quote: `Prizes: ${prizes}` });
  } else {
    evidence.push({ field: 'description', quote: `Hackathon: ${title}` });
  }

  return {
    contract_version: 'source-item-v2',
    visibility: 'public',
    source_kind: 'hackathon_registry',
    adapter: 'devpost-v1',
    external_id: String(item.id),
    title,
    organization: 'Devpost Community',
    type: 'hackathon',
    location,
    deadline,
    deadline_time: deadlineDetails?.time || null,
    deadline_display: deadlineDisplay,
    original_url: url,
    application_url: url,
    trust_tier: trustTier,
    source_badge: 'Devpost',
    risk_signals: riskSignals,
    skills: extractedSkills,
    requirements: structuredReqs,
    requirements_status: requirementsStatus,
    evidence,
    content_hash: hashString(rawText),
    raw_text: rawText,
    fields: {
      title,
      deadline,
      deadline_time: deadlineDetails?.time || null,
      deadline_display: deadlineDisplay,
      prizes,
      submission_window: datesSource,
      description,
      rules,
      eligibility: rawRules,
      skills: extractedSkills,
      requirements: structuredReqs,
      requirements_status: requirementsStatus,
      evidence
    },
    field_provenance: [
      { field: 'title', kind: 'structured_field', json_pointer: '/title', value: title },
      { field: 'submission_period', kind: 'structured_field', json_pointer: '/submission_period_dates', value: datesSource }
    ]
  };
}

export function enrichDevpostFromPage(item, pageHtmlOrText) {
  if (!item) return item;
  const isHtml = /<[a-z][\s\S]*>/i.test(pageHtmlOrText);
  return normalizeDevpostItem({
    ...item,
    raw_html: isHtml ? pageHtmlOrText : item.raw_html,
    page_text: !isHtml ? pageHtmlOrText : item.page_text
  });
}

export function normalizeJSearchItem(item) {
  if (!item || !item.job_id || !item.job_title) {
    throw new Error('INVALID_JSEARCH_PAYLOAD: Missing job_id or job_title');
  }

  const title = String(item.job_title).trim();
  const org = item.employer_name || 'Unknown Employer';
  const url = item.job_apply_link || item.job_google_link || '';
  const isIntern = /\b(?:intern|internship|trainee)\b/i.test(title + ' ' + (item.job_employment_type || ''));
  const type = isIntern ? 'internship' : 'job';
  const location = [item.job_city, item.job_state, item.job_country].filter(Boolean).join(', ') || null;
  const rawText = `${title}\nEmployer: ${org}\nLocation: ${location || 'N/A'}\nDescription: ${item.job_description || ''}\nLink: ${url}`;
  const riskSignals = detectRiskSignals(rawText);
  const trustTier = riskSignals.length > 0 ? 'unverified' : 'attributed';
  const { skills: extractedSkills, requirements: extractedReqs } = extractSkillsAndRequirements(item.job_description || '');
  const structuredReqs = buildStructuredRequirements(extractedReqs, extractedSkills, rawText);
  const requirementsStatus = structuredReqs.length > 0 ? 'REQUIREMENTS_PRESENT' : 'NO_REQUIREMENTS_STATED';

  const evidence = [
    { field: 'title', quote: title },
    { field: 'organization', quote: org },
    { field: 'type', quote: isIntern ? (title.match(/\b(intern|internship|trainee)\b/i)?.[0] || 'internship') : 'job' }
  ];
  if (location) {
    evidence.push({ field: 'location', quote: location });
  }
  if (extractedSkills.length > 0) {
    evidence.push({ field: 'skills', quote: extractedSkills.join(', ') });
    for (const sk of extractedSkills) {
      evidence.push({ field: 'skills', quote: sk });
    }
  }
  if (item.job_description) {
    evidence.push({ field: 'description', quote: item.job_description.slice(0, 500) });
  }

  return {
    contract_version: 'source-item-v2',
    visibility: 'public',
    source_kind: 'search_api',
    adapter: 'jsearch-v1',
    external_id: String(item.job_id),
    title,
    organization: org,
    type,
    location,
    deadline: null,
    original_url: url,
    application_url: url,
    trust_tier: trustTier,
    source_badge: 'JSearch India',
    risk_signals: riskSignals,
    skills: extractedSkills,
    requirements: structuredReqs,
    requirements_status: requirementsStatus,
    evidence,
    content_hash: hashString(rawText),
    raw_text: rawText,
    fields: {
      title,
      organization: org,
      location,
      deadline: null,
      skills: extractedSkills,
      requirements: structuredReqs,
      requirements_status: requirementsStatus,
      evidence
    },
    field_provenance: [
      { field: 'title', kind: 'structured_field', json_pointer: '/job_title', value: title },
      { field: 'employer', kind: 'structured_field', json_pointer: '/employer_name', value: org }
    ]
  };
}

export function normalizeGreenhouseItem(company, item) {
  if (!item || !item.id || !item.title) {
    throw new Error('INVALID_GREENHOUSE_PAYLOAD: Missing id or title');
  }

  const title = String(item.title).trim();
  const location = item.location?.name || null;
  const originalUrl = item.absolute_url || `https://boards.greenhouse.io/${company}/jobs/${item.id}`;
  const applyUrl = originalUrl;
  const isIntern = /\b(?:intern|internship|trainee|apprentice)\b/i.test(title);
  const type = isIntern ? 'internship' : 'job';
  const seniority = classifySeniority(title);

  const cleanContent = item.content ? htmlToCleanText(item.content) : '';
  const rawTextParts = [
    title,
    `Organization: ${company.toUpperCase()}`,
    location ? `Location: ${location}` : '',
    cleanContent,
    `Apply: ${applyUrl}`
  ].filter(Boolean);

  const rawText = rawTextParts.join('\n');
  const riskSignals = detectRiskSignals(rawText);
  if (location && !isIndiaOrRemoteLocation(location)) {
    riskSignals.push('foreign_location_excluded');
  }
  const trustTier = riskSignals.length > 0 ? 'unverified' : 'corroborated';
  const { skills: extractedSkills, requirements: extractedReqs } = extractSkillsAndRequirements(cleanContent);
  const structuredReqs = buildStructuredRequirements(extractedReqs, extractedSkills, rawText);
  const requirementsStatus = structuredReqs.length > 0 ? 'REQUIREMENTS_PRESENT' : 'NO_REQUIREMENTS_STATED';

  const evidence = [
    { field: 'title', quote: title },
    { field: 'organization', quote: company.toUpperCase() },
    { field: 'type', quote: isIntern ? (title.match(/\b(intern|internship|trainee|apprentice)\b/i)?.[0] || 'internship') : 'job' }
  ];
  if (location) {
    evidence.push({ field: 'location', quote: location });
  }
  if (extractedSkills.length > 0) {
    evidence.push({ field: 'skills', quote: extractedSkills.join(', ') });
    for (const sk of extractedSkills) {
      evidence.push({ field: 'skills', quote: sk });
    }
  }
  if (cleanContent) {
    evidence.push({ field: 'description', quote: cleanContent.slice(0, 500) });
  }

  return {
    contract_version: 'source-item-v2',
    visibility: 'public',
    source_kind: 'company_feed',
    adapter: 'greenhouse-v1',
    external_id: String(item.id),
    title,
    organization: company.toUpperCase(),
    type,
    location,
    deadline: null,
    original_url: originalUrl,
    application_url: applyUrl,
    trust_tier: trustTier,
    source_badge: `${company.toUpperCase()} Careers`,
    risk_signals: riskSignals,
    seniority_level: seniority,
    skills: extractedSkills,
    requirements: structuredReqs,
    requirements_status: requirementsStatus,
    evidence,
    content_hash: hashString(rawText),
    raw_text: rawText,
    fields: {
      title,
      organization: company.toUpperCase(),
      location,
      deadline: null,
      seniority_level: seniority,
      skills: extractedSkills,
      requirements: structuredReqs,
      requirements_status: requirementsStatus,
      evidence
    },
    field_provenance: [
      { field: 'title', kind: 'structured_field', json_pointer: '/title', value: title },
      { field: 'location', kind: 'structured_field', json_pointer: '/location/name', value: location },
      { field: 'apply_url', kind: 'structured_field', json_pointer: '/absolute_url', value: applyUrl }
    ]
  };
}

export function normalizeAshbyItem(company, item) {
  if (!item || !item.id || !item.title) {
    throw new Error('INVALID_ASHBY_PAYLOAD: Missing id or title');
  }

  const title = String(item.title).trim();
  const location = item.location || (typeof item.locationName === 'string' ? item.locationName : null);
  const originalUrl = item.jobUrl || `https://jobs.ashbyhq.com/${company}/${item.id}`;
  const applyUrl = item.applyUrl || originalUrl;
  const isIntern = /\b(?:intern|internship|trainee|apprentice)\b/i.test(title);
  const type = isIntern ? 'internship' : 'job';
  const seniority = classifySeniority(title);

  const cleanContent = item.descriptionPlain || (item.descriptionHtml ? htmlToCleanText(item.descriptionHtml) : '');
  const rawTextParts = [
    title,
    `Organization: ${company.toUpperCase()}`,
    location ? `Location: ${location}` : '',
    cleanContent,
    `Apply: ${applyUrl}`
  ].filter(Boolean);

  const rawText = rawTextParts.join('\n');
  const riskSignals = detectRiskSignals(rawText);
  if (location && !isIndiaOrRemoteLocation(location)) {
    riskSignals.push('foreign_location_excluded');
  }
  const trustTier = riskSignals.length > 0 ? 'unverified' : 'corroborated';
  const { skills: extractedSkills, requirements: extractedReqs } = extractSkillsAndRequirements(cleanContent);
  const structuredReqs = buildStructuredRequirements(extractedReqs, extractedSkills, rawText);
  const requirementsStatus = structuredReqs.length > 0 ? 'REQUIREMENTS_PRESENT' : 'NO_REQUIREMENTS_STATED';

  const evidence = [
    { field: 'title', quote: title },
    { field: 'organization', quote: company.toUpperCase() },
    { field: 'type', quote: isIntern ? (title.match(/\b(intern|internship|trainee|apprentice)\b/i)?.[0] || 'internship') : 'job' }
  ];
  if (location) {
    evidence.push({ field: 'location', quote: location });
  }
  if (extractedSkills.length > 0) {
    evidence.push({ field: 'skills', quote: extractedSkills.join(', ') });
    for (const sk of extractedSkills) {
      evidence.push({ field: 'skills', quote: sk });
    }
  }
  if (cleanContent) {
    evidence.push({ field: 'description', quote: cleanContent.slice(0, 500) });
  }

  return {
    contract_version: 'source-item-v2',
    visibility: 'public',
    source_kind: 'company_feed',
    adapter: 'ashby-v1',
    external_id: String(item.id),
    title,
    organization: company.toUpperCase(),
    type,
    location,
    deadline: null,
    original_url: originalUrl,
    application_url: applyUrl,
    trust_tier: trustTier,
    source_badge: `${company.toUpperCase()} Careers`,
    risk_signals: riskSignals,
    seniority_level: seniority,
    skills: extractedSkills,
    requirements: structuredReqs,
    requirements_status: requirementsStatus,
    evidence,
    content_hash: hashString(rawText),
    raw_text: rawText,
    fields: {
      title,
      organization: company.toUpperCase(),
      location,
      deadline: null,
      seniority_level: seniority,
      skills: extractedSkills,
      requirements: structuredReqs,
      requirements_status: requirementsStatus,
      evidence
    },
    field_provenance: [
      { field: 'title', kind: 'structured_field', json_pointer: '/title', value: title },
      { field: 'location', kind: 'structured_field', json_pointer: '/location', value: location },
      { field: 'apply_url', kind: 'structured_field', json_pointer: '/jobUrl', value: applyUrl }
    ]
  };
}
