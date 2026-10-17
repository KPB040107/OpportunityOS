import {createHash} from 'node:crypto';
import {extractSkillsAndRequirements} from './skill-extractor.mjs';

export function hashString(str) {
  return createHash('sha256').update(String(str || '')).digest('hex');
}

export function htmlToCleanText(html = '') {
  if (!html) return '';
  let text = String(html)
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
    requirements: extractedReqs,
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
      requirements: extractedReqs,
      evidence
    },
    field_provenance: [
      { field: 'title', kind: 'structured_field', json_pointer: '/text', value: title },
      { field: 'location', kind: 'structured_field', json_pointer: '/categories/location', value: location },
      { field: 'apply_url', kind: 'structured_field', json_pointer: '/applyUrl', value: applyUrl }
    ]
  };
}

export function parseDevpostDeadline(datesStr) {
  if (!datesStr) return null;
  // Match month day, year format at the end of the date range: e.g. "Aug 15 - Oct 25, 2026"
  const endMatch = datesStr.match(/(?:^|[-–—])\s*([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})\s*$/);
  const fallback = datesStr.match(/([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})/g);
  const target = endMatch ? endMatch[0] : (fallback ? fallback[fallback.length - 1] : null);
  if (!target) return null;

  const parts = target.match(/([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})/);
  if (!parts) return null;

  const [_, monthStr, dayStr, yearStr] = parts;
  const months = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };
  const m = months[monthStr.toLowerCase()];
  if (m === undefined) return null;

  const d = parseInt(dayStr, 10);
  const y = parseInt(yearStr, 10);
  if (y < 2000 || y > 2100) return null;

  const dateObj = new Date(Date.UTC(y, m, d));
  // Strict calendar verification: month and day must match exactly (prevent rollover)
  if (dateObj.getUTCFullYear() !== y || dateObj.getUTCMonth() !== m || dateObj.getUTCDate() !== d) {
    return null;
  }
  return dateObj.toISOString().slice(0, 10);
}

export function normalizeDevpostItem(item) {
  if (!item || !item.id || !item.title) {
    throw new Error('INVALID_DEVPOST_PAYLOAD: Missing id or title');
  }

  const title = String(item.title).trim();
  const url = item.url || `https://devpost.com/hackathons/${item.id}`;
  const deadline = parseDevpostDeadline(item.submission_period_dates);
  const prizes = item.prize_amount ? String(item.prize_amount).replace(/<[^>]*>/g, '').trim() : null;
  const location = item.displayed_location?.location || null;
  const rawText = `Hackathon: ${title}\nSubmission Period: ${item.submission_period_dates || 'Not stated'}\nPrizes: ${prizes || 'None listed'}\nURL: ${url}`;
  const riskSignals = detectRiskSignals(rawText);
  const trustTier = riskSignals.length > 0 ? 'unverified' : 'attributed';
  const { skills: extractedSkills, requirements: extractedReqs } = extractSkillsAndRequirements(rawText);

  const evidence = [
    { field: 'title', quote: title },
    { field: 'organization', quote: 'Devpost Community' },
    { field: 'type', quote: `Hackathon: ${title}` }
  ];
  if (location) {
    evidence.push({ field: 'location', quote: location });
  }
  if (item.submission_period_dates) {
    evidence.push({ field: 'deadline', quote: item.submission_period_dates });
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
    original_url: url,
    application_url: url,
    trust_tier: trustTier,
    source_badge: 'Devpost',
    risk_signals: riskSignals,
    skills: extractedSkills,
    requirements: extractedReqs,
    evidence,
    content_hash: hashString(rawText),
    raw_text: rawText,
    fields: {
      title,
      deadline,
      prizes,
      submission_window: item.submission_period_dates,
      skills: extractedSkills,
      requirements: extractedReqs,
      evidence
    },
    field_provenance: [
      { field: 'title', kind: 'structured_field', json_pointer: '/title', value: title },
      { field: 'submission_period', kind: 'structured_field', json_pointer: '/submission_period_dates', value: item.submission_period_dates }
    ]
  };
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
    requirements: extractedReqs,
    evidence,
    content_hash: hashString(rawText),
    raw_text: rawText,
    fields: {
      title,
      organization: org,
      location,
      deadline: null,
      skills: extractedSkills,
      requirements: extractedReqs,
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
    requirements: extractedReqs,
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
      requirements: extractedReqs,
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
    requirements: extractedReqs,
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
      requirements: extractedReqs,
      evidence
    },
    field_provenance: [
      { field: 'title', kind: 'structured_field', json_pointer: '/title', value: title },
      { field: 'location', kind: 'structured_field', json_pointer: '/location', value: location },
      { field: 'apply_url', kind: 'structured_field', json_pointer: '/jobUrl', value: applyUrl }
    ]
  };
}
