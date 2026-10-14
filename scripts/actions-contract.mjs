// This exact contract is embedded in n8n; the model has no action tools.
export function createActionsContract(){
 const version='actions-v3';
 const permittedActions=['tracker_update','calendar_event','calendar_link','email_notification','task_create','followup_schedule','approval_notification','deadline_reminder','followup_notification','error_notification'];
 const blockedActions=['submit_application','send_email_as_user','share_profile_external'];
 function validateActionSafety(type){if(blockedActions.includes(type))throw new Error('RISKY_ACTION_BLOCKED');if(!permittedActions.includes(type))throw new Error('UNKNOWN_ACTION_TYPE');return true;}
 function idempotencyKey(user,match,type){if(!user||!match||!type)throw new Error('MISSING_KEY_PARAMETERS');if(!permittedActions.includes(type))throw new Error('UNPERMITTED_ACTION_TYPE');return `${user}:${match}:${type}`;}
 function day(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
 function authorize(c,now=new Date()){
  validateActionSafety(c.type);if(!c.user_id||(!c.match_id&&c.type!=='error_notification')||!c.action_id||!c.claim_token)throw new Error('UNVERIFIED_ACTION_CONTEXT');
  if(c.type==='error_notification'&&!c.match_id&&(c.claimed!==true||c.email_enabled!==true))throw new Error('UNVERIFIED_ACTION_CONTEXT');
  if(['approval_notification','error_notification'].includes(c.type))return true;
  if(c.match?.decision==='ACT'&&c.approved!==true){
    if(c.opportunity?.trust_tier==='unverified'||(c.opportunity?.risk_signals&&c.opportunity.risk_signals.length>0))throw new Error('UNVERIFIED_SOURCE_BLOCKED');
    if(c.opportunity?.trust_tier==='attributed'&&['calendar_event','calendar_link','followup_schedule','deadline_reminder'].includes(c.type))throw new Error('ATTRIBUTED_SOURCE_CALENDAR_BLOCKED');
  }
  const hasValidDeadline=c.opportunity?.deadline&&c.opportunity.deadline>day(now);
  const isNoDeadlineAllowed=!c.opportunity?.deadline&&['internship','job'].includes(c.opportunity?.type)&&['tracker_update','email_notification'].includes(c.type);
  if(c.match?.status!=='complete'||!['ACT','ASK'].includes(c.match.decision)||c.match.eligibility_status!=='ELIGIBLE'||c.match.evaluation_day!==day(now)||(!hasValidDeadline&&!isNoDeadlineAllowed))throw new Error('POLICY_CHANGED');
  return true; // Atomic database claims also enforce ACT/approved permission and revision.
 }
 function calendarDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw new Error('VALID_DEADLINE_REQUIRED');return new Date(value+'T00:00:00Z');}
 const esc=value=>String(value||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
 function formatIcsEvent({title,organization,deadline,applicationUrl,matchScore,uid='opportunityos-event',now=new Date()}){
  if(!title)throw new Error('TITLE_REQUIRED_FOR_CALENDAR');const start=calendarDate(deadline),end=new Date(start.getTime()+86400000),date=d=>d.toISOString().slice(0,10).replaceAll('-','');
  if(applicationUrl&&!/^https?:\/\//i.test(applicationUrl))throw new Error('UNSAFE_APPLICATION_URL');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//OpportunityOS//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${esc(uid)}@opportunityos.local`,`DTSTAMP:${now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,`SUMMARY:Deadline: ${esc(title)} (${esc(organization||'Unknown Organisation')})`,`DESCRIPTION:${esc(`Opportunity: ${title}\nOrganization: ${organization||'Unknown Organisation'}\nMatch Score: ${matchScore??'N/A'}/100\nApply here: ${applicationUrl||'Not stated'}`)}`,applicationUrl?`URL:${esc(applicationUrl)}`:'',`DTSTART;VALUE=DATE:${date(start)}`,`DTEND;VALUE=DATE:${date(end)}`,'END:VEVENT','END:VCALENDAR'].filter(Boolean);
  return lines.map(line=>{const out=[];let chunk='',size=0;for(const char of line){const bytes=unescape(encodeURIComponent(char)).length;if(size+bytes>73){out.push(chunk);chunk=' '+char;size=1+bytes;}else{chunk+=char;size+=bytes;}}out.push(chunk);return out.join('\r\n');}).join('\r\n')+'\r\n';
 }
 function formatNotificationEmail({opportunity,match,actionResults={}}){
  const subject=`[OpportunityOS] ${opportunity.title||'Opportunity'} (${opportunity.organization||'Unknown Organisation'})`.replace(/[\r\n]/g,' ');
  const text=[`Opportunity: ${opportunity.title}`,`Match Score: ${match.match_score??'N/A'}/100 (Confidence: ${Math.round((match.confidence||0)*100)}%)`,`Deadline: ${opportunity.deadline||'Not stated'}`,`Application Link: ${opportunity.application_url||'Not stated'}`,`Completed actions: ${(actionResults.completed||[]).join(', ')||'Check your activity for current action results.'}`,'OpportunityOS will NEVER automatically submit an application for you.'].join('\n');return {subject,text};
 }
 function formatApprovalEmail({confirmationUrl,opportunity,match,requiresInformation=false}){
  if(!confirmationUrl||!/\/approvals\/[0-9a-f-]{36}\?revision=\d+$/i.test(confirmationUrl))throw new Error('AUTHENTICATED_CONFIRMATION_URL_REQUIRED');
  return {subject:`[OpportunityOS Action Needed] Review: ${opportunity.title}`.replace(/[\r\n]/g,' '),text:[opportunity.title,match.explanation||'Review required.',requiresInformation?'Correct the missing facts and reevaluate before approval.':'Sign in and explicitly approve or reject on the confirmation page.',confirmationUrl,'Opening this link does not approve anything.'].join('\n'),confirmationUrl};
 }
 return {version,permittedActions,blockedActions,idempotencyKey,validateActionSafety,authorize,day,formatIcsEvent,formatNotificationEmail,formatApprovalEmail};
}
