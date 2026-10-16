// Slice S6: Deterministic Weekly Planner Contract
// Implements pure deterministic scheduling from confirmed deadlines and manual availability.
// Zero AI calls, strict deadline-capacity allocation, and pressure vs overlap separation.

export const PLANNER_CONTRACT_VERSION = 'weekly-plan-v1';
export const ALGORITHM_VERSION = 'deadline-capacity-v1';

export interface WorkingWindow {
  day: number; // 0=Sunday, 1=Monday, ..., 6=Saturday (or 1=Mon..7=Sun normalized)
  start: string; // "HH:MM" e.g. "09:00"
  end: string; // "HH:MM" e.g. "12:00"
}

export interface BusyBlock {
  title: string;
  start: string; // ISO string
  end: string; // ISO string
}

export interface UserAvailability {
  weekly_budget_hours: number;
  working_windows: WorkingWindow[];
  busy_blocks: BusyBlock[];
  timezone: string;
  revision: number;
}

export interface OpportunityCandidate {
  id: string;
  title: string;
  organization: string;
  deadline: string | null; // ISO date string or YYYY-MM-DD
  match_score?: number | null;
  eligibility?: string | null;
  trust_tier?: string | null;
  type?: string | null;
  risk_flags?: string[] | null;
  match_revision?: number | null;
}

export interface ScheduledTaskItem {
  opportunity_id: string;
  title: string;
  organization: string;
  deadline: string | null;
  start_at: string; // ISO UTC
  end_at: string; // ISO UTC
  duration_minutes: number;
  reason_codes: string[];
}

export interface UnscheduledTaskItem {
  opportunity_id: string;
  title: string;
  organization: string;
  deadline: string | null;
  reason_code:
    | 'EXCEEDS_WEEKLY_EFFORT_BUDGET'
    | 'NO_AVAILABLE_WINDOW_BEFORE_DEADLINE'
    | 'BLOCKED_BY_BUSY_INTERVAL'
    | 'INELIGIBLE_OR_RISK_FLAG'
    | 'UNKNOWN_ELIGIBILITY'
    | 'UNVERIFIED_SOURCE'
    | 'EXPIRED_DEADLINE';
  explanation: string;
}

export interface PressureNote {
  type: 'same_day_deadline_pressure' | 'high_capacity_utilization';
  date?: string;
  affected_opportunities?: string[];
  message: string;
}

export interface PlannedTask {
  id: string;
  user_id: string;
  plan_id: string;
  opportunity_id: string;
  title: string;
  organization: string;
  deadline: string | null;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  status: string;
  created_at: string;
}

export interface PlanRecord extends WeeklyPlanResult {
  id?: string;
  user_id?: string;
  status?: 'draft' | 'confirmed' | 'discarded' | 'superseded';
  created_at?: string;
  confirmed_at?: string | null;
}

export interface WeeklyPlanResult {
  contract_version: string;
  algorithm_version: string;
  plan_week_start: string;
  profile_revision: number;
  availability_revision: number;
  scheduled_items: ScheduledTaskItem[];
  unscheduled_items: UnscheduledTaskItem[];
  pressure_notes: PressureNote[];
  total_scheduled_minutes: number;
  budget_minutes: number;
}

interface GeneratePlanOptions {
  candidates: OpportunityCandidate[];
  availability: UserAvailability;
  weekStart: string; // YYYY-MM-DD (Monday)
  profileRevision?: number;
  customEstimates?: Record<string, number>; // opportunity_id -> duration_minutes
  priorities?: Record<string, 'high' | 'normal' | 'low'>;
}

/**
 * Normalizes day of week to 0 (Sunday) through 6 (Saturday).
 */
function normalizeDayIndex(day: number): number {
  if (day === 7) return 0; // if 7 used for Sunday
  return day % 7;
}

/**
 * Parses "HH:MM" into minutes from start of day.
 */
function parseTimeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map((v) => parseInt(v, 10));
  return (h || 0) * 60 + (m || 0);
}

/**
 * Generates available 30-minute time slots for the given week from working windows,
 * filtering out any slot that overlaps with a busy block.
 */
function generateAvailableSlots(
  weekStartStr: string,
  workingWindows: WorkingWindow[],
  busyBlocks: BusyBlock[]
): Array<{ start: Date; end: Date; duration: number }> {
  const slots: Array<{ start: Date; end: Date; duration: number }> = [];
  const parsedBusy = busyBlocks.map((b) => ({
    title: b.title,
    start: new Date(b.start).getTime(),
    end: new Date(b.end).getTime(),
  }));

  const startDate = new Date(weekStartStr + 'T00:00:00Z');

  // Generate slots for each of the 7 days of the week
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const currentDay = new Date(startDate.getTime() + dayOffset * 86400000);
    const dayOfWeek = currentDay.getUTCDay(); // 0=Sun, 1=Mon...

    // Find working windows matching this day
    const matchingWindows = workingWindows.filter(
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

        // Check overlap with busy blocks
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

  // Sort slots chronologically
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Deterministically generates a weekly plan respecting deadlines, availability capacity,
 * 30-minute block slots, and busy intervals without any AI calls.
 */
export function generateWeeklyPlan({
  candidates,
  availability,
  weekStart,
  profileRevision = 1,
  customEstimates = {},
  priorities = {},
}: GeneratePlanOptions): WeeklyPlanResult {
  const budgetMinutes = Math.round((availability.weekly_budget_hours || 10) * 60);
  let remainingBudgetMinutes = budgetMinutes;

  // 1. Filter out completely ineligible, unknown, unverified, or expired candidates
  const validCandidates: OpportunityCandidate[] = [];
  const unscheduled: UnscheduledTaskItem[] = [];

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

  // 2. Deterministic sorting:
  // Priority (high=3, normal=2, low=1) -> Earliest Confirmed Deadline -> Match Score -> Stable ID
  const priorityWeight: Record<string, number> = { high: 3, normal: 2, low: 1 };

  const sortedCandidates = [...validCandidates].sort((a, b) => {
    // 1. Explicit Priority Override
    const prioA = priorityWeight[priorities[a.id] || 'normal'] ?? 2;
    const prioB = priorityWeight[priorities[b.id] || 'normal'] ?? 2;
    if (prioA !== prioB) return prioB - prioA;

    // 2. Earliest Confirmed Deadline
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
      return -1; // Items with deadlines placed first
    } else if (!a.deadline && b.deadline) {
      return 1;
    }

    // 3. Match Score (descending)
    const scoreA = a.match_score ?? 0;
    const scoreB = b.match_score ?? 0;
    if (scoreA !== scoreB) return scoreB - scoreA;

    // 4. Stable Opportunity ID (ascending) for deterministic stability
    return a.id.localeCompare(b.id);
  });

  // 3. Generate available time slots
  const availableSlots = generateAvailableSlots(
    weekStart,
    availability.working_windows || [],
    availability.busy_blocks || []
  );

  const slotUsed = new Array(availableSlots.length).fill(false);
  const scheduled: ScheduledTaskItem[] = [];

  // 4. Place candidates into available slots
  for (const cand of sortedCandidates) {
    const duration = customEstimates[cand.id] || 30;
    const slotsNeeded = Math.max(1, Math.ceil(duration / 30));

    // Check effort budget
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

    // Find the earliest free contiguous block of slots before the deadline
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
          // Pure calendar date comparison: slot calendar date must be <= deadline calendar date
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
      // Could not place before deadline or no windows available
      const reasonCode = availability.busy_blocks.length > 0
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

    // Allocate slot(s)
    for (let k = 0; k < slotsNeeded; k++) {
      slotUsed[assignedSlotIdx + k] = true;
    }
    const slot = availableSlots[assignedSlotIdx];
    const endSlot = availableSlots[assignedSlotIdx + slotsNeeded - 1];
    remainingBudgetMinutes -= duration;

    const reasons: string[] = [];
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

  // 5. Detect Pressure vs Overlap
  const pressureNotes: PressureNote[] = [];

  // Group by deadline calendar date to spot same-day pressure
  const deadlineGroups: Record<string, string[]> = {};
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
  const utilization = totalScheduledMinutes / budgetMinutes;
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
