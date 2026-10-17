export type Evidence = {field:string;quote:string};
export type Requirement = {id:string;kind:string;value:string;mandatory:boolean;evidence_snippet:string;normalized_value:Record<string,unknown>|null;requirement_class?:'mandatory_eligibility'|'required_skill'|'preferred_skill'|'other_requirement'|'benefit';quote?:string;status?:string};
export type Opportunity = {id:string;title:string|null;organization:string|null;deadline:string|null;location:string|null;type:string;application_url:string|null;description:string|null;skills:string[];ambiguity_flags:string[];extraction_confidence:number;extracted_json:{evidence:Evidence[]};created_at:string;trust_tier?:'corroborated'|'attributed'|'unverified';source_badge?:string|null;risk_signals?:string[];requirements_status?:'NO_REQUIREMENTS_STATED'|'EXTRACTION_INCOMPLETE'|'REQUIREMENTS_PRESENT'};
export const opportunityFields='id,title,organization,deadline,location,type,application_url,description,skills,ambiguity_flags,extraction_confidence,extracted_json,created_at,trust_tier,source_badge,risk_signals,requirements_status';
export const errorMessages:Record<string,string>={
  UNSAFE_URL:'This link is not a supported public website.',UNSAFE_ADDRESS:'This website resolves to a restricted network address.',UNSAFE_REDIRECT:'This website redirected to an unsafe destination.',
  SOURCE_TIMEOUT:'The website took too long to respond. Try pasting the announcement text.',SOURCE_TOO_LARGE:'This page is too large. Paste the relevant announcement instead.',SOURCE_TEXT_TOO_LARGE:'This page contains too much text. Paste a single announcement instead.',
  SOURCE_REDIRECT_LIMIT:'The website redirected too many times.',SOURCE_HTTP_ERROR:'The website could not be read. It may require a login or block automated readers. Paste the announcement text instead.',SOURCE_UNSUPPORTED:'This link is not a supported HTML or text page. Paste its announcement text instead.',SOURCE_NO_READABLE_TEXT:'This page did not contain enough readable text. It may need JavaScript; paste the announcement instead.',SOURCE_ROBOTS_BLOCKED:'This website does not permit this page to be read automatically. Paste the announcement text instead.',
  INVALID_EXTRACTION:'The analysis did not pass our source-evidence checks. Review the announcement and retry, or submit clearer text.',AI_UNAVAILABLE:'The analysis service was unavailable. Your submission is preserved.',QUOTA_LIMIT:'The free AI allowance is currently unavailable. Your submission is preserved; retry after the allowance resets.',PROCESSING_INTERRUPTED:'Analysis was interrupted. Your submission is preserved; you can request a retry.'
};
export function deadlineLabel(date:string|null){return date?new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z')):'Not stated';}
export function flagLabel(flag:string){return ({missing_title:'Title not stated',missing_organization:'Organisation not stated',missing_deadline:'Deadline not stated clearly',requirements_need_interpretation:'Some requirements need clarification',source_variation:'Sources contain different details',source_contains_instructions:'Source contains instructions that were treated as text'} as Record<string,string>)[flag]||flag.replaceAll('_',' ');}
export function trustBadgeDetails(tier?: string, badge?: string | null) {
  if (tier === 'corroborated') {
    return {
      label: badge || 'Corroborated Source',
      className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      description: 'Direct official employer feed'
    };
  }
  if (tier === 'unverified') {
    return {
      label: 'Unverified Source · Review Required',
      className: 'bg-red-50 text-red-800 border-red-200',
      description: 'Risk signals detected; automated actions held for review'
    };
  }
  return {
    label: badge || 'Attributed Source',
    className: 'bg-blue-50 text-blue-800 border-blue-200',
    description: 'Public aggregator; low-risk actions only'
  };
}

export type CompensationDetails = {
  label: string;
  value: string;
  paidStatus?: 'Paid' | 'Unpaid' | 'Not disclosed';
  badgeText: string;
  className: string;
};

export function extractCompensationDetails(opp: {
  type?: string | null;
  description?: string | null;
  fields?: Record<string, unknown> | null;
  extracted_json?: Record<string, unknown> | null;
  raw_text?: string | null;
  raw_content?: string | null;
  title?: string | null;
}): CompensationDetails {
  const normType = (opp.type || '').toLowerCase();
  const ext = opp.extracted_json as Record<string, unknown> | undefined;
  const fields = (opp.fields || ext?.fields) as Record<string, unknown> | undefined;
  const rawDesc = String(
    opp.description ||
    fields?.description ||
    ext?.description ||
    opp.raw_text ||
    ''
  );

  const structuredVal = fields?.salary ||
                        fields?.stipend ||
                        ext?.salary;
  if (typeof structuredVal === 'string' && structuredVal.trim()) {
    const sTrim = structuredVal.trim();
    if (normType === 'internship') {
      const isUnpaid = /\bunpaid\b/i.test(sTrim);
      return {
        label: 'Stipend',
        value: sTrim,
        paidStatus: isUnpaid ? 'Unpaid' : 'Paid',
        badgeText: isUnpaid ? 'Stipend: Unpaid' : `Stipend: ${sTrim} · Paid`,
        className: isUnpaid ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-emerald-50 text-emerald-900 border-emerald-200',
      };
    }
    return {
      label: 'Salary',
      value: sTrim,
      paidStatus: 'Paid',
      badgeText: `Salary: ${sTrim}`,
      className: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    };
  }

  if (normType === 'internship') {
    if (/\b(?:unpaid\s+internship|unpaid\s+role|unpaid\s+position|stipend\s*[:\-]\s*(?:unpaid|none|nil|0|no\s+stipend))\b/i.test(rawDesc)) {
      return {
        label: 'Stipend',
        value: 'Unpaid',
        paidStatus: 'Unpaid',
        badgeText: 'Stipend: Unpaid',
        className: 'bg-amber-50 text-amber-900 border-amber-200',
      };
    }
    const m = rawDesc.match(/(?:stipend|remuneration|pay)\s*[:\-]\s*([^\n;]+?)(?:\.|\n|$)/i) ||
              rawDesc.match(/(?:₹|Rs\.?|INR)\s*([0-9]+(?:,[0-9]+)*(?:\s*(?:-|to)\s*(?:₹|Rs\.?|INR)?\s*[0-9]+(?:,[0-9]+)*)?\s*(?:\/|\s*per\s*)?(?:month|mo|pm\b)?)/i) ||
              rawDesc.match(/\b([0-9]{1,2}(?:\.[0-9]+)?|\d{2,3})k\s*(?:\/|\s*per\s*)?(?:month|mo|pm\b)/i);
    if (m) {
      const val = (m[1] ? m[1].trim() : m[0].trim()).replace(/[.]+$/, '');
      return {
        label: 'Stipend',
        value: val,
        paidStatus: 'Paid',
        badgeText: `Stipend: ${val} · Paid`,
        className: 'bg-emerald-50 text-emerald-900 border-emerald-200',
      };
    }
    if (/\bpaid\s+internship\b/i.test(rawDesc)) {
      return {
        label: 'Stipend',
        value: 'Paid (Amount not disclosed)',
        paidStatus: 'Paid',
        badgeText: 'Stipend: Paid',
        className: 'bg-emerald-50 text-emerald-900 border-emerald-200',
      };
    }
    return {
      label: 'Stipend',
      value: 'Not disclosed',
      paidStatus: 'Not disclosed',
      badgeText: 'Stipend: Not disclosed',
      className: 'bg-slate-50 text-slate-700 border-slate-200',
    };
  }

  if (normType === 'job') {
    const m = rawDesc.match(/(?:CTC|salary|package)\s*[:\-]\s*([^\n;]+?)(?:\.|\n|$)/i) ||
              rawDesc.match(/\b([0-9]+(?:\.[0-9]+)?(?:\s*(?:-|to)\s*[0-9]+(?:\.[0-9]+)?)?\s*LPA)\b/i) ||
              rawDesc.match(/(?:₹|Rs\.?|INR|\$)\s*([0-9]+(?:,[0-9]+)*(?:\s*(?:-|to)\s*(?:₹|Rs\.?|INR|\$)?\s*[0-9]+(?:,[0-9]+)*)?\s*(?:(?:\/|\s*per\s*)(?:year|annum|yr|mo)|\s*k\b)?)/i);
    if (m) {
      const val = (m[1] ? m[1].trim() : m[0].trim()).replace(/[.]+$/, '');
      return {
        label: 'Salary',
        value: val,
        paidStatus: 'Paid',
        badgeText: `Salary: ${val}`,
        className: 'bg-emerald-50 text-emerald-900 border-emerald-200',
      };
    }
    return {
      label: 'Salary',
      value: 'Not disclosed',
      paidStatus: 'Not disclosed',
      badgeText: 'Salary: Not disclosed',
      className: 'bg-slate-50 text-slate-700 border-slate-200',
    };
  }

  if (normType === 'hackathon') {
    const m = rawDesc.match(/(?:prize\s*pool|total\s*prizes?|prizes?)\s*[:\-]?\s*(?:INR|Rs\.?|₹|\$|USD)?\s*([0-9]+(?:,[0-9]+)*(?:\s*(?:k|lakhs?|lac|crores?|m\b))?)/i);
    if (m) {
      const val = m[0].trim();
      return {
        label: 'Prizes',
        value: val,
        badgeText: val.charAt(0).toUpperCase() + val.slice(1),
        className: 'bg-purple-50 text-purple-900 border-purple-200',
      };
    }
    return {
      label: 'Prizes',
      value: 'Free / Open',
      badgeText: 'Entry: Free / Open',
      className: 'bg-purple-50 text-purple-900 border-purple-200',
    };
  }

  return {
    label: 'Compensation',
    value: 'Not disclosed',
    badgeText: 'Not disclosed',
    className: 'bg-slate-50 text-slate-700 border-slate-200',
  };
}
