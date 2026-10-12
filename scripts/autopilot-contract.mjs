// Pure autopilot and error handling contract for Slice 5.
// Enforces schedule boundaries, deadline reminder email formatting, and secret-safe error sanitization.

export function createAutopilotContract() {
  const version = 'autopilot-v1';

  function calculateNextRun(now = new Date(), intervalHours = 24) {
    const d = new Date(now.getTime() + intervalHours * 3600000);
    return d.toISOString();
  }

  function categorizeDeadlineUrgency(daysRemaining) {
    if (daysRemaining <= 1) return 'critical';
    if (daysRemaining <= 3) return 'urgent';
    return 'upcoming';
  }

  function formatDeadlineReminderEmail({ userEmail, deadlines = [] }) {
    if (!deadlines.length) {
      return {
        subject: '[OpportunityOS] Daily Scan: All Caught Up',
        text: 'Hello,\n\nOpportunityOS ran your daily background scan. No immediate deadlines are due in the next 7 days.\n\nBest,\nYour OpportunityOS Agent'
      };
    }

    const urgentCount = deadlines.filter(d => (d.days_remaining ?? 99) <= 3).length;
    const subject = urgentCount > 0
      ? `[OpportunityOS Alert] ${urgentCount} Upcoming Deadline(s) Need Attention`
      : `[OpportunityOS] Daily Deadline Digest (${deadlines.length} opportunities)`;

    const itemsText = deadlines.map(d => {
      const urgency = categorizeDeadlineUrgency(d.days_remaining ?? 7);
      const daysText = d.days_remaining === 0 ? 'TODAY' : d.days_remaining === 1 ? 'TOMORROW' : `in ${d.days_remaining} days`;
      return [
        `• [${urgency.toUpperCase()}] ${d.title} (${d.organization || 'Unknown Org'})`,
        `  Deadline: ${d.deadline} (${daysText})`,
        `  Status: ${d.status || 'to_apply'}`,
        d.application_url ? `  Apply Link: ${d.application_url}` : null
      ].filter(Boolean).join('\n');
    }).join('\n\n');

    const text = [
      `Hello,`,
      ``,
      `Here is your OpportunityOS automated deadline briefing:`,
      ``,
      itemsText,
      ``,
      `Remember: OpportunityOS will NEVER automatically submit an application for you. Please review and apply at your convenience.`,
      ``,
      `Best,`,
      `Your OpportunityOS Agent`
    ].join('\n');

    return { subject, text };
  }

  function sanitizeErrorMessage(rawError) {
    if (!rawError) return 'Unknown error occurred';
    let str = typeof rawError === 'string' ? rawError : (rawError.message || JSON.stringify(rawError));
    
    // Redact JWT tokens (eyJ...)
    str = str.replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, '[REDACTED_JWT]');
    
    // Redact Bearer tokens
    str = str.replace(/Bearer\s+[a-zA-Z0-9._~+/-]+=*/gi, 'Bearer [REDACTED_TOKEN]');
    
    // Redact postgres connection strings
    str = str.replace(/postgres(?:ql)?:\/\/[^:]+:[^@]+@[^\s]+/gi, 'postgres://[REDACTED_DB_CREDENTIALS]');
    
    // Redact API keys matching common patterns
    str = str.replace(/(?:key|secret|password|token)=['"]?[a-zA-Z0-9_.-]{16,}['"]?/gi, '$1=[REDACTED]');

    return str;
  }

  return {
    version,
    calculateNextRun,
    categorizeDeadlineUrgency,
    formatDeadlineReminderEmail,
    sanitizeErrorMessage
  };
}
