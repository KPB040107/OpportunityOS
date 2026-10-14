import {createHash} from 'node:crypto';

export function hashString(str) {
  return createHash('sha256').update(String(str || '')).digest('hex');
}

export function detectRiskSignals(text = '') {
  const content = String(text || '');
  const signals = [];

  const feeMatch = content.match(/\b(?:registration fee|processing fee|application fee|training fee|security deposit|pay \$?\d+|send money)\b/i);
  if (feeMatch) {
    signals.push(`fee_payment_required: "${feeMatch[0]}"`);
  }

  const credentialMatch = content.match(/\b(?:send (?:your )?(?:password|bank account|credit card|cvv|otp))\b/i);
  if (credentialMatch) {
    signals.push(`credential_request: "${credentialMatch[0]}"`);
  }

  const injectionMatch = content.match(/\b(?:ignore (?:all )?(?:previous )?instructions|system prompt|override (?:all )?policies|mark as act|eval:\s*act)\b/i);
  if (injectionMatch) {
    signals.push(`prompt_injection_detected: "${injectionMatch[0]}"`);
  }

  return signals;
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

  const rawText = `${title}\nOrganization: ${company.toUpperCase()}\nLocation: ${location || 'Not specified'}\nCommitment: ${commitment}\nTeam: ${team || 'N/A'}\nApply: ${applyUrl}`;
  const riskSignals = detectRiskSignals(rawText);
  const trustTier = riskSignals.length > 0 ? 'unverified' : 'corroborated';

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
    content_hash: hashString(rawText),
    raw_text: rawText,
    fields: {
      title,
      organization: company.toUpperCase(),
      location,
      commitment,
      deadline: null
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
  // e.g. "Aug 31 - Oct 23, 2026" or "Oct 01 - Nov 15, 2026"
  const endMatch = datesStr.match(/([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})/g);
  if (endMatch && endMatch.length) {
    const lastDate = endMatch[endMatch.length - 1];
    const parsed = new Date(lastDate + ' UTC');
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return null;
}

export function normalizeDevpostItem(item) {
  if (!item || !item.id || !item.title) {
    throw new Error('INVALID_DEVPOST_PAYLOAD: Missing id or title');
  }

  const title = String(item.title).trim();
  const url = item.url || `https://devpost.com/hackathons/${item.id}`;
  const deadline = parseDevpostDeadline(item.submission_period_dates);
  const prizes = item.prize_amount ? String(item.prize_amount).replace(/<[^>]*>/g, '').trim() : null;
  const rawText = `Hackathon: ${title}\nSubmission Period: ${item.submission_period_dates || 'Not stated'}\nPrizes: ${prizes || 'None listed'}\nURL: ${url}`;
  const riskSignals = detectRiskSignals(rawText);
  const trustTier = riskSignals.length > 0 ? 'unverified' : 'attributed';

  return {
    contract_version: 'source-item-v2',
    visibility: 'public',
    source_kind: 'hackathon_registry',
    adapter: 'devpost-v1',
    external_id: String(item.id),
    title,
    organization: 'Devpost Community',
    type: 'hackathon',
    location: item.displayed_location?.location || 'Online',
    deadline,
    original_url: url,
    application_url: url,
    trust_tier: trustTier,
    source_badge: 'Devpost',
    risk_signals: riskSignals,
    content_hash: hashString(rawText),
    raw_text: rawText,
    fields: {
      title,
      deadline,
      prizes,
      submission_window: item.submission_period_dates
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
    content_hash: hashString(rawText),
    raw_text: rawText,
    fields: {
      title,
      organization: org,
      location,
      deadline: null
    },
    field_provenance: [
      { field: 'title', kind: 'structured_field', json_pointer: '/job_title', value: title },
      { field: 'employer', kind: 'structured_field', json_pointer: '/employer_name', value: org }
    ]
  };
}
