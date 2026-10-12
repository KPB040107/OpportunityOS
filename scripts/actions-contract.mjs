// Actions and side-effects contract for Slice 4: Act and Ask.
// Pure functions enforce idempotency keys, safe action boundaries, and .ics generation.

export function createActionsContract() {
  const version = 'actions-v1';
  const permittedActions = ['tracker_update', 'calendar_event', 'email_notification', 'followup_schedule'];
  const blockedActions = ['submit_application', 'send_email_as_user', 'share_profile_external'];

  function idempotencyKey(userId, matchId, actionType) {
    if (!userId || !matchId || !actionType) throw new Error('MISSING_KEY_PARAMETERS');
    if (!permittedActions.includes(actionType)) throw new Error('UNPERMITTED_ACTION_TYPE');
    return `${userId}:${matchId}:${actionType}`;
  }

  function validateActionSafety(actionType) {
    if (blockedActions.includes(actionType)) {
      throw new Error(`RISKY_ACTION_BLOCKED: ${actionType} is strictly prohibited.`);
    }
    if (!permittedActions.includes(actionType)) {
      throw new Error(`UNKNOWN_ACTION_TYPE: ${actionType}`);
    }
    return true;
  }

  function formatIcsEvent({ title, organization, deadline, applicationUrl, matchScore }) {
    if (!title) throw new Error('TITLE_REQUIRED_FOR_CALENDAR');
    const org = organization || 'Unknown Organisation';
    const cleanTitle = `${title} (${org})`.replace(/[,;]/g, ' ');
    const desc = `Opportunity: ${title}\\nOrganization: ${org}\\nMatch Score: ${matchScore ?? 'N/A'}/100\\nApply here: ${applicationUrl || 'N/A'}`;
    
    // Default to deadline date or 7 days from now if null
    let dt = deadline ? new Date(deadline) : new Date(Date.now() + 7 * 86400000);
    if (isNaN(dt.getTime())) dt = new Date(Date.now() + 7 * 86400000);
    
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dt.getUTCDate()).padStart(2, '0');
    const dateStr = `${y}${m}${d}`;

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//OpportunityOS//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `SUMMARY:Deadline: ${cleanTitle}`,
      `DESCRIPTION:${desc}`,
      applicationUrl ? `URL:${applicationUrl}` : '',
      `DTSTART;VALUE=DATE:${dateStr}`,
      `DTEND;VALUE=DATE:${dateStr}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].filter(Boolean).join('\r\n');
  }

  function formatNotificationEmail({ userEmail, opportunity, match, actionResults }) {
    const title = opportunity.title || 'Untitled Opportunity';
    const org = opportunity.organization || 'Unknown Organisation';
    const score = match.match_score ?? 'N/A';
    const conf = match.confidence ? Math.round(match.confidence * 100) : 'N/A';
    
    const subject = `[OpportunityOS] Automatic Action: ${title} (${org})`;
    const text = [
      `Hello,`,
      ``,
      `OpportunityOS has evaluated a strong match and automatically taken safe actions on your behalf:`,
      ``,
      `Opportunity: ${title}`,
      `Organization: ${org}`,
      `Match Score: ${score}/100 (Confidence: ${conf}%)`,
      `Deadline: ${opportunity.deadline || 'Not stated'}`,
      `Application Link: ${opportunity.application_url || 'Not stated'}`,
      ``,
      `Actions Taken:`,
      `- Added to your Application Tracker as 'To Apply'`,
      `- Scheduled application reminder`,
      actionResults?.calendarEvent ? `- Added to your Google Calendar` : `- Calendar .ics link generated`,
      ``,
      `Remember: OpportunityOS will NEVER automatically submit an application for you. Please review and apply at your convenience.`,
      ``,
      `Best,`,
      `Your OpportunityOS Agent`
    ].join('\n');

    return { subject, text };
  }

  function formatApprovalEmail({ resumeUrl, opportunity, match }) {
    if (!resumeUrl) throw new Error('RESUME_URL_REQUIRED');
    const title = opportunity.title || 'Untitled Opportunity';
    const org = opportunity.organization || 'Unknown Organisation';
    const reasons = match.explanation || 'Uncertain requirements or unverified deadline.';

    const approveLink = `${resumeUrl}?decision=approve`;
    const rejectLink = `${resumeUrl}?decision=reject`;

    const subject = `[OpportunityOS Action Needed] Review: ${title} (${org})`;
    const text = [
      `Hello,`,
      ``,
      `OpportunityOS evaluated an opportunity that requires your review before any action is taken:`,
      ``,
      `Opportunity: ${title}`,
      `Organization: ${org}`,
      `Reason for review: ${reasons}`,
      ``,
      `Would you like to track this opportunity and create calendar reminders?`,
      ``,
      `[APPROVE] Add to tracker and schedule reminders:`,
      `${approveLink}`,
      ``,
      `[REJECT] Ignore this opportunity:`,
      `${rejectLink}`,
      ``,
      `You can also review and resolve this in your web Approval Center.`,
      ``,
      `Best,`,
      `Your OpportunityOS Agent`
    ].join('\n');

    return { subject, text, approveLink, rejectLink };
  }

  return {
    version,
    permittedActions,
    blockedActions,
    idempotencyKey,
    validateActionSafety,
    formatIcsEvent,
    formatNotificationEmail,
    formatApprovalEmail
  };
}
