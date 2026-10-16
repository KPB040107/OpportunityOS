// Slice S6: Deterministic Weekly Planner Contract (Pure JS for n8n and Node)
export const PLANNER_CONTRACT_VERSION = 'weekly-plan-v1';
export const ALGORITHM_VERSION = 'deadline-capacity-v1';

export function normalizeDayIndex(day) {
  if (day === 7) return 0;
  return Number(day) % 7;
}

export function parseTimeToMinutes(timeStr) {
  const [h, m] = String(timeStr || '0:0').split(':').map((v) => parseInt(v, 10));
  return (h || 0) * 60 + (m || 0);
}

export function generateAvailableSlots(weekStartStr, workingWindows = [], busyBlocks = []) {
  const slots = [];
  const parsedBusy = (busyBlocks || []).map((b) => ({
    title: b.title,
    start: new Date(b.start).getTime(),
    end: new Date(b.end).getTime(),
  }));

  const startDate = new Date(weekStartStr + 'T00:00:00Z');

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const currentDay = new Date(startDate.getTime() + dayOffset * 86400000);
    const dayOfWeek = currentDay.getUTCDay();

    const matchingWindows = (workingWindows || []).filter(
      (w) => normalizeDayIndex(w.day) === dayOfWeek
    );

    for (const win of matchingWindows) {
      const winStartMin = parseTimeToMinutes(win.start);
      const winEndMin = parseTimeToMinutes(win.end);

      let slotStartMin = winStartMin;
      while (slotStartMin + 30 <= winEndMin) {
        const slotEndMin = slotStartMin + 30;

        const slotStartDate = new Date(currentDay);
        slotStartDate.setUTCHours(Math.floor(slotStartMin / 60), slotStartMin % 60, 0, 0);

        const slotEndDate = new Date(currentDay);
        slotEndDate.setUTCHours(Math.floor(slotEndMin / 60), slotEndMin % 60, 0, 0);

        const slotStartMs = slotStartDate.getTime();
        const slotEndMs = slotEndDate.getTime();

        const isBlocked = parsedBusy.some(
          (busy) => slotStartMs < busy.end && slotEndMs > busy.start
        );

        if (!isBlocked) {
          slots.push({
            start: slotStartDate,
            end: slotEndDate,
            duration: 30,
          });
        }

        slotStartMin += 30;
      }
    }
  }

  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function generateWeeklyPlan({
  candidates = [],
  availability = {},
  weekStart,
  profileRevision = 1,
  customEstimates = {},
  priorities = {},
} = {}) {
  const budgetMinutes = Math.round((availability.weekly_budget_hours || 10) * 60);
  let remainingBudgetMinutes = budgetMinutes;

  const validCandidates = [];
  const unscheduled = [];

  for (const cand of candidates) {
    if (cand.eligibility === 'INELIGIBLE') {
      unscheduled.push({
        opportunity_id: cand.id,
        title: cand.title,
        organization: cand.organization,
        deadline: cand.deadline,
        reason_code: 'INELIGIBLE_OR_RISK_FLAG',
        explanation: 'Opportunity does not match mandatory criteria or student profile.',
      });
      continue;
    }
    if (cand.eligibility === 'UNKNOWN') {
      unscheduled.push({
        opportunity_id: cand.id,
        title: cand.title,
        organization: cand.organization,
        deadline: cand.deadline,
        reason_code: 'UNKNOWN_ELIGIBILITY',
        explanation: 'Opportunity eligibility is UNKNOWN; student profile facts or opportunity criteria require clarification before scheduling.',
      });
      continue;
    }
    if (cand.trust_tier === 'unverified') {
      unscheduled.push({
        opportunity_id: cand.id,
        title: cand.title,
        organization: cand.organization,
        deadline: cand.deadline,
        reason_code: 'UNVERIFIED_SOURCE',
        explanation: 'Opportunity was captured from an unverified source; requires source verification before scheduling.',
      });
      continue;
    }
    if (cand.risk_flags && (cand.risk_flags.includes('payment_required') || cand.risk_flags.includes('fraud_warning'))) {
      unscheduled.push({
        opportunity_id: cand.id,
        title: cand.title,
        organization: cand.organization,
        deadline: cand.deadline,
        reason_code: 'INELIGIBLE_OR_RISK_FLAG',
        explanation: 'Opportunity is flagged for risk or required payment.',
      });
      continue;
    }
    if (cand.deadline) {
      const deadlineDateStr = cand.deadline.slice(0, 10);
      if (deadlineDateStr < weekStart) {
        unscheduled.push({
          opportunity_id: cand.id,
          title: cand.title,
          organization: cand.organization,
          deadline: cand.deadline,
          reason_code: 'EXPIRED_DEADLINE',
          explanation: `Deadline (${deadlineDateStr}) has already passed before plan week start (${weekStart}).`,
        });
        continue;
      }
    }
    validCandidates.push(cand);
  }

  const priorityWeight = { high: 3, normal: 2, low: 1 };

  const sortedCandidates = [...validCandidates].sort((a, b) => {
    const prioA = priorityWeight[priorities[a.id] || 'normal'] ?? 2;
    const prioB = priorityWeight[priorities[b.id] || 'normal'] ?? 2;
    if (prioA !== prioB) return prioB - prioA;

    if (a.deadline && b.deadline) {
      const dateA = a.deadline.slice(0, 10);
      const dateB = b.deadline.slice(0, 10);
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      if (a.deadline.includes('T') && !b.deadline.includes('T')) return -1;
      if (!a.deadline.includes('T') && b.deadline.includes('T')) return 1;
      if (a.deadline.includes('T') && b.deadline.includes('T')) {
        const diff = new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        if (diff !== 0) return diff;
      }
    } else if (a.deadline && !b.deadline) {
      return -1;
    } else if (!a.deadline && b.deadline) {
      return 1;
    }

    const scoreA = a.match_score ?? 0;
    const scoreB = b.match_score ?? 0;
    if (scoreA !== scoreB) return scoreB - scoreA;

    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  const availableSlots = generateAvailableSlots(
    weekStart,
    availability.working_windows || [],
    availability.busy_blocks || []
  );

  const slotUsed = new Array(availableSlots.length).fill(false);
  const scheduled = [];

  for (const cand of sortedCandidates) {
    const duration = customEstimates[cand.id] || 30;
    const slotsNeeded = Math.max(1, Math.ceil(duration / 30));

    if (duration > remainingBudgetMinutes) {
      unscheduled.push({
        opportunity_id: cand.id,
        title: cand.title,
        organization: cand.organization,
        deadline: cand.deadline,
        reason_code: 'EXCEEDS_WEEKLY_EFFORT_BUDGET',
        explanation: `Requires ${duration} minutes, which exceeds your remaining capacity of ${remainingBudgetMinutes} minutes (budget: ${availability.weekly_budget_hours}h).`,
      });
      continue;
    }

    let assignedSlotIdx = -1;
    for (let i = 0; i <= availableSlots.length - slotsNeeded; i++) {
      let canFit = true;
      for (let k = 0; k < slotsNeeded; k++) {
        if (slotUsed[i + k]) {
          canFit = false;
          break;
        }
        if (k > 0 && availableSlots[i + k].start.getTime() !== availableSlots[i + k - 1].end.getTime()) {
          canFit = false;
          break;
        }
      }
      if (!canFit) continue;

      const endSlot = availableSlots[i + slotsNeeded - 1];
      let isBeforeDeadline = true;

      if (cand.deadline) {
        if (cand.deadline.includes('T')) {
          const deadlineMs = new Date(cand.deadline).getTime();
          isBeforeDeadline = endSlot.end.getTime() <= deadlineMs;
        } else {
          const slotDateStr = endSlot.start.toISOString().slice(0, 10);
          const dlDateStr = cand.deadline.slice(0, 10);
          isBeforeDeadline = slotDateStr <= dlDateStr;
        }
      }

      if (isBeforeDeadline) {
        assignedSlotIdx = i;
        break;
      }
    }

    if (assignedSlotIdx === -1) {
      const reasonCode = (availability.busy_blocks || []).length > 0
        ? 'BLOCKED_BY_BUSY_INTERVAL'
        : 'NO_AVAILABLE_WINDOW_BEFORE_DEADLINE';

      unscheduled.push({
        opportunity_id: cand.id,
        title: cand.title,
        organization: cand.organization,
        deadline: cand.deadline,
        reason_code: reasonCode,
        explanation: cand.deadline
          ? `No open availability windows before deadline (${cand.deadline.slice(0, 10)}).`
          : 'No available working windows remaining this week.',
      });
      continue;
    }

    for (let k = 0; k < slotsNeeded; k++) {
      slotUsed[assignedSlotIdx + k] = true;
    }
    const slot = availableSlots[assignedSlotIdx];
    const endSlot = availableSlots[assignedSlotIdx + slotsNeeded - 1];
    remainingBudgetMinutes -= duration;

    const reasons = [];
    if (priorities[cand.id] === 'high') {
      reasons.push('USER_PRIORITY_OVERRIDE');
    }
    if (cand.deadline) {
      reasons.push('EARLIEST_CONFIRMED_DEADLINE');
    } else {
      reasons.push('MATCH_SCORE_RANK');
    }

    scheduled.push({
      opportunity_id: cand.id,
      title: cand.title,
      organization: cand.organization,
      deadline: cand.deadline,
      start_at: slot.start.toISOString(),
      end_at: endSlot.end.toISOString(),
      duration_minutes: duration,
      reason_codes: reasons,
    });
  }

  const pressureNotes = [];
  const deadlineGroups = {};
  for (const cand of candidates) {
    if (cand.deadline) {
      const dateKey = cand.deadline.slice(0, 10);
      deadlineGroups[dateKey] = deadlineGroups[dateKey] || [];
      deadlineGroups[dateKey].push(cand.title);
    }
  }

  for (const [date, titles] of Object.entries(deadlineGroups)) {
    if (titles.length >= 2) {
      pressureNotes.push({
        type: 'same_day_deadline_pressure',
        date,
        affected_opportunities: titles,
        message: `${titles.length} opportunities have deadlines on the same day (${date}): ${titles.join(', ')}. Tasks are staggered across preceding windows.`,
      });
    }
  }

  const totalScheduledMinutes = budgetMinutes - remainingBudgetMinutes;
  const utilization = budgetMinutes > 0 ? totalScheduledMinutes / budgetMinutes : 0;
  if (utilization >= 0.85) {
    pressureNotes.push({
      type: 'high_capacity_utilization',
      message: `Weekly capacity utilization is high (${Math.round(utilization * 100)}% of ${availability.weekly_budget_hours}h). Consider adjusting working windows or priorities if needed.`,
    });
  }

  return {
    contract_version: PLANNER_CONTRACT_VERSION,
    algorithm_version: ALGORITHM_VERSION,
    plan_week_start: weekStart,
    profile_revision: profileRevision,
    availability_revision: availability.revision || 1,
    scheduled_items: scheduled,
    unscheduled_items: unscheduled,
    pressure_notes: pressureNotes,
    total_scheduled_minutes: totalScheduledMinutes,
    budget_minutes: budgetMinutes,
  };
}
