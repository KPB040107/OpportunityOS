import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateWeeklyPlan,
  PLANNER_CONTRACT_VERSION,
  ALGORITHM_VERSION,
} from './planner-contract.mjs';

const baseAvailability = {
  weekly_budget_hours: 4.0, // 240 minutes
  working_windows: [
    { day: 1, start: '09:00', end: '11:00' }, // Monday: 4 x 30m slots
    { day: 2, start: '14:00', end: '16:00' }, // Tuesday: 4 x 30m slots
    { day: 3, start: '10:00', end: '12:00' }, // Wednesday: 4 x 30m slots
  ],
  busy_blocks: [],
  timezone: 'Asia/Kolkata',
  revision: 1,
};

test('generateWeeklyPlan: deterministic output under identical inputs', () => {
  const candidates = [
    { id: 'opp-1', title: 'React Intern', organization: 'Alpha', deadline: '2026-10-21T23:59:59Z', match_score: 85 },
    { id: 'opp-2', title: 'Backend Intern', organization: 'Beta', deadline: '2026-10-20T23:59:59Z', match_score: 90 },
  ];

  const plan1 = generateWeeklyPlan({
    candidates,
    availability: baseAvailability,
    weekStart: '2026-10-19',
  });

  const plan2 = generateWeeklyPlan({
    candidates,
    availability: baseAvailability,
    weekStart: '2026-10-19',
  });

  assert.equal(plan1.contract_version, PLANNER_CONTRACT_VERSION);
  assert.equal(plan1.algorithm_version, ALGORITHM_VERSION);
  assert.deepEqual(plan1.scheduled_items, plan2.scheduled_items, 'Planner must be strictly deterministic');
  assert.deepEqual(plan1.unscheduled_items, plan2.unscheduled_items);
});

test('generateWeeklyPlan: ranks earliest confirmed deadline before later deadline', () => {
  const candidates = [
    { id: 'opp-later', title: 'Later Job', organization: 'Beta', deadline: '2026-10-22T23:59:59Z', match_score: 95 },
    { id: 'opp-earlier', title: 'Earlier Job', organization: 'Alpha', deadline: '2026-10-20T23:59:59Z', match_score: 75 },
  ];

  const plan = generateWeeklyPlan({
    candidates,
    availability: baseAvailability,
    weekStart: '2026-10-19',
  });

  assert.equal(plan.scheduled_items.length, 2);
  assert.equal(plan.scheduled_items[0].opportunity_id, 'opp-earlier', 'Earlier deadline must be scheduled first');
  assert.equal(plan.scheduled_items[1].opportunity_id, 'opp-later');
});

test('generateWeeklyPlan: user priority override takes precedence over deadline', () => {
  const candidates = [
    { id: 'opp-earlier', title: 'Earlier Job', organization: 'Alpha', deadline: '2026-10-20T23:59:59Z', match_score: 75 },
    { id: 'opp-dream', title: 'Dream Hackathon', organization: 'Gamma', deadline: '2026-10-23T23:59:59Z', match_score: 90 },
  ];

  const plan = generateWeeklyPlan({
    candidates,
    availability: baseAvailability,
    weekStart: '2026-10-19',
    priorities: {
      'opp-dream': 'high', // Override dream hackathon to high priority
    },
  });

  assert.equal(plan.scheduled_items[0].opportunity_id, 'opp-dream', 'High priority item must be scheduled first');
  assert.ok(plan.scheduled_items[0].reason_codes.includes('USER_PRIORITY_OVERRIDE'));
});

test('generateWeeklyPlan: enforces effort budget and moves overflow to unscheduled', () => {
  const smallBudgetAvailability = {
    ...baseAvailability,
    weekly_budget_hours: 1.0, // Only 60 minutes budget
  };

  const candidates = [
    { id: 'opp-1', title: 'Task 1', organization: 'Org A', deadline: '2026-10-21', match_score: 90 },
    { id: 'opp-2', title: 'Task 2', organization: 'Org B', deadline: '2026-10-22', match_score: 85 },
    { id: 'opp-3', title: 'Task 3', organization: 'Org C', deadline: '2026-10-23', match_score: 80 },
  ];

  const plan = generateWeeklyPlan({
    candidates,
    availability: smallBudgetAvailability,
    weekStart: '2026-10-19',
  });

  // 60 minutes budget allows two 30-minute tasks
  assert.equal(plan.scheduled_items.length, 2);
  assert.equal(plan.unscheduled_items.length, 1);
  assert.equal(plan.unscheduled_items[0].opportunity_id, 'opp-3');
  assert.equal(plan.unscheduled_items[0].reason_code, 'EXCEEDS_WEEKLY_EFFORT_BUDGET');
});

test('generateWeeklyPlan: respects busy blocks (e.g. Exams) and avoids blocked windows', () => {
  const examAvailability = {
    ...baseAvailability,
    busy_blocks: [
      // Block Monday morning (09:00 - 12:00) with Midterm Exams
      { title: 'Exams', start: '2026-10-19T09:00:00Z', end: '2026-10-19T12:00:00Z' },
    ],
  };

  const candidates = [
    { id: 'opp-mon', title: 'Mon Due', organization: 'Org A', deadline: '2026-10-19T10:00:00Z' },
  ];

  const plan = generateWeeklyPlan({
    candidates,
    availability: examAvailability,
    weekStart: '2026-10-19',
  });

  // Monday morning is blocked by Exams, so the task due Monday 10:00 cannot be scheduled
  assert.equal(plan.scheduled_items.length, 0);
  assert.equal(plan.unscheduled_items.length, 1);
  assert.equal(plan.unscheduled_items[0].reason_code, 'BLOCKED_BY_BUSY_INTERVAL');
});

test('generateWeeklyPlan: detects same-day deadline pressure separately from time overlap', () => {
  const candidates = [
    { id: 'opp-1', title: 'Acme Internship', organization: 'Acme', deadline: '2026-10-21T18:00:00Z' },
    { id: 'opp-2', title: 'Beta Hackathon', organization: 'Beta', deadline: '2026-10-21T23:59:59Z' },
  ];

  const plan = generateWeeklyPlan({
    candidates,
    availability: baseAvailability,
    weekStart: '2026-10-19',
  });

  const pressureNote = plan.pressure_notes.find((n) => n.type === 'same_day_deadline_pressure');
  assert.ok(pressureNote, 'Must generate same-day deadline pressure note');
  assert.equal(pressureNote.date, '2026-10-21');
  assert.equal(pressureNote.affected_opportunities.length, 2);
  assert.ok(pressureNote.message.includes('2 opportunities have deadlines on the same day'));
});

test('generateWeeklyPlan: filters out INELIGIBLE and critical risk flagged items', () => {
  const candidates = [
    { id: 'opp-bad', title: 'Ineligible Job', organization: 'ScamCo', eligibility: 'INELIGIBLE' },
    { id: 'opp-fee', title: 'Fee Job', organization: 'FakeCo', risk_flags: ['payment_required'] },
    { id: 'opp-good', title: 'Legit Internship', organization: 'GoodCo', eligibility: 'ELIGIBLE' },
  ];

  const plan = generateWeeklyPlan({
    candidates,
    availability: baseAvailability,
    weekStart: '2026-10-19',
  });

  assert.equal(plan.scheduled_items.length, 1);
  assert.equal(plan.scheduled_items[0].opportunity_id, 'opp-good');
  assert.equal(plan.unscheduled_items.length, 2);
  assert.equal(plan.unscheduled_items[0].reason_code, 'INELIGIBLE_OR_RISK_FLAG');
});

test('generateWeeklyPlan: keeps UNKNOWN eligibility, unverified source, and expired items unscheduled', () => {
  const candidates = [
    { id: 'opp-unknown', title: 'Uncertain Job', organization: 'UnknownCo', eligibility: 'UNKNOWN', deadline: '2026-10-22' },
    { id: 'opp-unverified', title: 'Unverified Job', organization: 'RandomCo', eligibility: 'ELIGIBLE', trust_tier: 'unverified', deadline: '2026-10-22' },
    { id: 'opp-expired', title: 'Expired Job', organization: 'PastCo', eligibility: 'ELIGIBLE', deadline: '2026-10-10' },
    { id: 'opp-eligible', title: 'Eligible Job', organization: 'VerifiedCo', eligibility: 'ELIGIBLE', trust_tier: 'verified', deadline: '2026-10-22' },
  ];

  const plan = generateWeeklyPlan({
    candidates,
    availability: baseAvailability,
    weekStart: '2026-10-19',
  });

  assert.equal(plan.scheduled_items.length, 1, 'Only eligible, verified, non-expired item scheduled');
  assert.equal(plan.scheduled_items[0].opportunity_id, 'opp-eligible');

  const unknownItem = plan.unscheduled_items.find(i => i.opportunity_id === 'opp-unknown');
  assert.ok(unknownItem, 'UNKNOWN item must be in unscheduled_items');
  assert.equal(unknownItem.reason_code, 'UNKNOWN_ELIGIBILITY');

  const unverifiedItem = plan.unscheduled_items.find(i => i.opportunity_id === 'opp-unverified');
  assert.ok(unverifiedItem, 'Unverified item must be in unscheduled_items');
  assert.equal(unverifiedItem.reason_code, 'UNVERIFIED_SOURCE');

  const expiredItem = plan.unscheduled_items.find(i => i.opportunity_id === 'opp-expired');
  assert.ok(expiredItem, 'Expired item must be in unscheduled_items');
  assert.equal(expiredItem.reason_code, 'EXPIRED_DEADLINE');
});

test('generateWeeklyPlan: preserves date-only deadline without inventing 23:59:59 UTC', () => {
  const candidates = [
    { id: 'opp-date-only', title: 'Date Only Job', organization: 'Org A', eligibility: 'ELIGIBLE', deadline: '2026-10-21' },
  ];

  const plan = generateWeeklyPlan({
    candidates,
    availability: baseAvailability,
    weekStart: '2026-10-19',
  });

  assert.equal(plan.scheduled_items.length, 1);
  assert.equal(plan.scheduled_items[0].deadline, '2026-10-21', 'Date-only deadline must remain pure YYYY-MM-DD');
  assert.ok(!plan.scheduled_items[0].deadline.includes('23:59:59'), 'Must never invent 23:59:59 UTC');
});

test('generateWeeklyPlan: allocates contiguous slots for multi-unit tasks and prevents double-booking', () => {
  const candidates = [
    { id: 't1', title: 'Task 1 (60m)', organization: 'Org A', eligibility: 'ELIGIBLE', match_score: 90 },
    { id: 't2', title: 'Task 2 (30m)', organization: 'Org B', eligibility: 'ELIGIBLE', match_score: 80 },
  ];

  const plan = generateWeeklyPlan({
    candidates,
    availability: {
      weekly_budget_hours: 10,
      working_windows: [{ day: 1, start: '09:00', end: '11:00' }],
      busy_blocks: []
    },
    weekStart: '2026-10-19',
    customEstimates: { t1: 60 }
  });

  assert.equal(plan.scheduled_items.length, 2);
  const task1 = plan.scheduled_items.find(i => i.opportunity_id === 't1');
  const task2 = plan.scheduled_items.find(i => i.opportunity_id === 't2');
  assert.equal(task1.duration_minutes, 60);
  assert.equal(task2.duration_minutes, 30);
  // Task 1 spans 09:00 to 10:00 (two 30m slots)
  assert.equal(new Date(task1.end_at).getTime() - new Date(task1.start_at).getTime(), 60 * 60 * 1000);
  // Task 2 starts at or after 10:00 (no double-booking)
  assert.ok(new Date(task2.start_at).getTime() >= new Date(task1.end_at).getTime(), 'Task 2 must not overlap Task 1');
});
