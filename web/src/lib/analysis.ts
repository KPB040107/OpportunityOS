export type Evidence = {field:string;quote:string};
export type Requirement = {id:string;kind:string;value:string;mandatory:boolean;evidence_snippet:string;normalized_value:Record<string,unknown>|null};
export type Opportunity = {id:string;title:string|null;organization:string|null;deadline:string|null;location:string|null;type:string;application_url:string|null;description:string|null;skills:string[];ambiguity_flags:string[];extraction_confidence:number;extracted_json:{evidence:Evidence[]};created_at:string;trust_tier?:'corroborated'|'attributed'|'unverified';source_badge?:string|null;risk_signals?:string[]};
export const opportunityFields='id,title,organization,deadline,location,type,application_url,description,skills,ambiguity_flags,extraction_confidence,extracted_json,created_at,trust_tier,source_badge,risk_signals';
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
