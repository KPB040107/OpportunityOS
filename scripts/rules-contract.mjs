// Standing Rules & Autonomy Ledger Deterministic Contract
// Hackathon Demo Build Guide v3.0 Slice S3 & Decision D7

export function evaluateRuleProposal({ decisions, existingRules = [] }) {
  if (!Array.isArray(decisions) || decisions.length < 3) return null;

  // Filter out invalid choices: only 'approve' and 'reject' are learning choices (pin is never action consent)
  const validDecisions = decisions.filter(d => ['approve', 'reject'].includes(d.choice));

  // Group decisions by scope and opportunity type
  const sorted = [...validDecisions].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  
  const scopes = new Set(sorted.map(d => `${d.source_scope}:${d.opportunity_type}`));

  for (const key of scopes) {
    const [scope, oppType] = key.split(':');
    const scopeDecisions = sorted.filter(d => d.source_scope === scope && d.opportunity_type === oppType);
    if (scopeDecisions.length < 3) continue;

    const recentThree = scopeDecisions.slice(0, 3);
    const firstChoice = recentThree[0].choice;

    // Consistency: all three must have the exact same choice ('approve' or 'reject')
    const isConsistent = recentThree.every(d => d.choice === firstChoice);
    if (!isConsistent) {
      continue;
    }

    // Must be 3 distinct opportunities (prevent duplicate decisions on same opportunity from triggering rule)
    const distinctOpportunities = new Set(recentThree.map(d => d.opportunity_id || d.id));
    if (distinctOpportunities.size < 3) {
      continue;
    }

    // Check if an active or proposed rule already exists for this scope and type
    const alreadyExists = existingRules.some(
      r => r.source_scope === scope && r.opportunity_type === oppType && ['proposed', 'active'].includes(r.status)
    );
    if (alreadyExists) continue;

    const isApprove = firstChoice === 'approve';
    const rule_type = isApprove ? 'preauthorize' : 'ignore';
    const scopeCapitalized = scope.charAt(0).toUpperCase() + scope.slice(1);
    const typeCapitalized = oppType.charAt(0).toUpperCase() + oppType.slice(1);

    const title = isApprove
      ? `Auto-track high-match ${scopeCapitalized} ${typeCapitalized}s`
      : `Auto-ignore ${scopeCapitalized} ${typeCapitalized}s`;

    const description = isApprove
      ? `Automatically track and notify for ${scopeCapitalized} ${oppType} opportunities with at least 60 score and 65% confidence without asking.`
      : `Automatically ignore ${scopeCapitalized} ${oppType} opportunities.`;

    return {
      status: 'proposed',
      rule_type,
      source_scope: scope,
      opportunity_type: oppType,
      title,
      description,
      conditions: { min_score: 60, min_confidence: 0.65 },
      allowed_action_types: ['tracker_update', 'email_notification'],
      supporting_decision_ids: recentThree.map(d => d.id),
      version: 1
    };
  }

  return null;
}

export function applyStandingRule({ match, opportunity, rules = [], now = new Date().toISOString() }) {
  if (!match || !opportunity) return { applied: false, reason: 'INVALID_INPUT' };

  const dayNow = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(now));

  // Hard Gate 1: Ineligible or Unknown eligibility
  if (match.eligibility_status !== 'ELIGIBLE') {
    return { applied: false, reason: 'INELIGIBLE_OR_UNKNOWN' };
  }

  // Hard Gate 2: Expired deadline
  if (opportunity.deadline && opportunity.deadline <= dayNow) {
    return { applied: false, reason: 'EXPIRED' };
  }

  // Hard Gate 3: Unverified trust or detected risk signals
  if (
    opportunity.trust_tier === 'unverified' ||
    (Array.isArray(opportunity.risk_signals) && opportunity.risk_signals.length > 0)
  ) {
    return { applied: false, reason: 'UNVERIFIED_OR_RISK' };
  }

  // Hard Gate 4: Rules only resolve baseline ASK
  if (match.decision !== 'ASK') {
    return { applied: false, reason: 'BASELINE_NOT_ASK' };
  }

  const scope = (opportunity.source_badge || opportunity.organization || 'general').toLowerCase();
  const oppType = opportunity.type;

  // Find active rule for this scope and opportunity type
  const activeRule = rules.find(
    r => r.status === 'active' && r.source_scope === scope && r.opportunity_type === oppType
  );

  if (!activeRule) {
    return { applied: false, reason: 'NO_MATCHING_RULE' };
  }

  if (activeRule.rule_type === 'preauthorize') {
    const minScore = Math.max(60, activeRule.conditions?.min_score ?? 60);
    const minConfidence = Math.max(0.65, activeRule.conditions?.min_confidence ?? 0.65);

    // Floor requirement (Decision D7): score >= 60, confidence >= 0.65
    if (
      match.match_score === null ||
      match.match_score < minScore ||
      match.confidence === null ||
      match.confidence < minConfidence
    ) {
      return { applied: false, reason: 'BELOW_RULE_FLOOR' };
    }

    return {
      applied: true,
      rule_id: activeRule.id,
      decision: 'ACT',
      question_avoided: true,
      reason: `Preauthorized by standing rule: ${activeRule.title}`,
      allowed_action_types: activeRule.allowed_action_types || ['tracker_update', 'email_notification']
    };
  }

  if (activeRule.rule_type === 'ignore') {
    return {
      applied: true,
      rule_id: activeRule.id,
      decision: 'IGNORE',
      question_avoided: true,
      reason: `Ignored by standing rule: ${activeRule.title}`
    };
  }

  return { applied: false, reason: 'UNSUPPORTED_RULE_TYPE' };
}

export function calculateAutonomyLedgerStats({ ledgerEntries = [], opportunities = [], matches = [] }) {
  const items_read = opportunities.length;
  const items_ignored = matches.filter(m => m.decision === 'IGNORE').length;
  const items_acted = matches.filter(m => m.decision === 'ACT').length;
  const items_asked = matches.filter(m => m.decision === 'ASK').length;

  const realAvoided = ledgerEntries.filter(e => e.question_avoided && !e.is_seeded).length;
  const seededAvoided = ledgerEntries.filter(e => e.question_avoided && e.is_seeded).length;

  const seededRead = opportunities.filter(o => o.is_seeded || /DEMO DATA|SETUP TEST/i.test(o.raw_content || '')).length;

  return {
    items_read,
    items_ignored,
    items_acted,
    items_asked,
    questions_avoided: realAvoided,
    breakdown: {
      real: {
        items_read: Math.max(0, items_read - seededRead),
        questions_avoided: realAvoided
      },
      seeded: {
        items_read: seededRead,
        questions_avoided: seededAvoided
      }
    }
  };
}
