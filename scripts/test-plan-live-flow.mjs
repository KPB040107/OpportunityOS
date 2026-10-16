// Slice S6: Live End-to-End Weekly Planner Flow Test
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const { createChunks } = require('@supabase/ssr');

const envConfig = Object.fromEntries(
  fs.readFileSync('web/.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);

const BASE_URL = envConfig.APP_ORIGIN || 'http://localhost:3000';
const SESSION_FILE = path.resolve('.local/repair-live-session.json');

function getMondayOfCurrentWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

async function run() {
  console.log('=== TESTING SLICE S6 DETERMINISTIC WEEKLY PLANNER LIVE FLOW ===\n');

  if (!fs.existsSync(SESSION_FILE)) {
    throw new Error(`Missing session file at ${SESSION_FILE}. Run session setup first.`);
  }

  const savedSession = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  const key = 'sb-' + new URL(envConfig.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0] + '-auth-token';
  const chunks = createChunks(key, 'base64-' + Buffer.from(JSON.stringify(savedSession)).toString('base64url'));
  const cookieHeader = chunks.map((c) => c.name + '=' + c.value).join('; ');

  // 1. Unauthenticated requests must return 401
  console.log('1. Testing unauthenticated endpoint protection...');
  const endpoints = [
    { url: `${BASE_URL}/api/plan`, method: 'GET' },
    { url: `${BASE_URL}/api/plan/availability`, method: 'PUT', body: {} },
    { url: `${BASE_URL}/api/plan/generate`, method: 'POST', body: {} },
    { url: `${BASE_URL}/api/plan/confirm`, method: 'POST', body: {} },
  ];

  for (const ep of endpoints) {
    const res = await fetch(ep.url, {
      method: ep.method,
      headers: ep.body ? { 'Content-Type': 'application/json' } : undefined,
      body: ep.body ? JSON.stringify(ep.body) : undefined,
    });
    assert.equal(res.status, 401, `Unauthenticated ${ep.method} ${ep.url} must return 401`);
  }
  console.log('✓ All 4 planner endpoints reject unauthenticated access with HTTP 401');

  // 2. Initial state loading via GET /api/plan
  console.log('2. Fetching user plan workspace via GET /api/plan...');
  const initialRes = await fetch(`${BASE_URL}/api/plan`, {
    headers: { Cookie: cookieHeader },
  });
  assert.equal(initialRes.status, 200, 'GET /api/plan must return 200');
  const initialData = await initialRes.json();
  assert.ok(initialData.availability, 'Must return user availability');
  assert.ok(Array.isArray(initialData.candidates), 'Must return candidates array');
  console.log(`✓ Fetched workspace successfully (Candidates available: ${initialData.candidates.length}, Current Availability Rev: ${initialData.availability.revision})`);

  // 3. Save User Availability via PUT /api/plan/availability
  console.log('3. Testing invalid availability validation bounds...');
  const badBudgetRes = await fetch(`${BASE_URL}/api/plan/availability`, {
    method: 'PUT',
    headers: { Cookie: cookieHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ weekly_budget_hours: 80 }), // Exceeds 60h check constraint
  });
  assert.equal(badBudgetRes.status, 400, 'Budget > 60h must be rejected with HTTP 400');
  console.log('✓ Weekly budget > 60h properly rejected with HTTP 400');

  console.log('3b. Saving configured availability with working windows & busy exam block...');
  const weekMondayStr = getMondayOfCurrentWeek();
  const weekMonday = new Date(weekMondayStr + 'T00:00:00Z');
  
  // Set exam on Wednesday 18:30 to 20:30
  const examWed = new Date(weekMonday);
  examWed.setUTCDate(examWed.getUTCDate() + 2);
  const examStart = new Date(examWed);
  examStart.setUTCHours(18, 30, 0, 0);
  const examEnd = new Date(examWed);
  examEnd.setUTCHours(20, 30, 0, 0);

  const saveAvailRes = await fetch(`${BASE_URL}/api/plan/availability`, {
    method: 'PUT',
    headers: { Cookie: cookieHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      weekly_budget_hours: 12.0,
      working_windows: [
        { day: 1, start: '18:00', end: '21:00' }, // Mon 3h
        { day: 2, start: '18:00', end: '21:00' }, // Tue 3h
        { day: 3, start: '18:00', end: '21:00' }, // Wed 3h (contains exam)
        { day: 4, start: '18:00', end: '21:00' }, // Thu 3h
      ],
      busy_blocks: [
        {
          title: 'Database Systems Midterm Exam',
          start: examStart.toISOString(),
          end: examEnd.toISOString(),
        },
      ],
      timezone: 'UTC',
    }),
  });
  assert.equal(saveAvailRes.status, 200, 'PUT /api/plan/availability must return 200');
  const savedAvailData = await saveAvailRes.json();
  assert.ok(savedAvailData.availability, 'Returned saved availability');
  const newAvailRevision = savedAvailData.availability.revision;
  console.log(`✓ Availability saved with revision fence ${newAvailRevision}`);

  // 4. Generate Deterministic Weekly Plan via POST /api/plan/generate
  console.log('4. Generating deterministic weekly plan...');
  const genRes = await fetch(`${BASE_URL}/api/plan/generate`, {
    method: 'POST',
    headers: { Cookie: cookieHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan_week_start: weekMondayStr,
    }),
  });
  assert.equal(genRes.status, 200, 'POST /api/plan/generate must return 200');
  const genData = await genRes.json();
  const plan = genData.plan;
  assert.ok(plan, 'Must return generated plan');
  assert.equal(plan.contract_version, 'weekly-plan-v1', 'Must match weekly-plan-v1 contract');
  assert.equal(plan.algorithm_version, 'deadline-capacity-v1', 'Must match deadline-capacity-v1 algorithm');
  assert.equal(plan.status, 'draft', 'Generated plan should be saved as draft');
  assert.ok(Array.isArray(plan.scheduled_items), 'Must contain scheduled_items');
  assert.ok(Array.isArray(plan.unscheduled_items), 'Must contain unscheduled_items');
  assert.ok(Array.isArray(plan.pressure_notes), 'Must contain pressure_notes');

  console.log(`✓ Draft plan generated: ${plan.scheduled_items.length} scheduled tasks, ${plan.unscheduled_items.length} unscheduled items, ${plan.pressure_notes.length} pressure notes`);

  // Verify no scheduled tasks fall inside the busy exam block
  for (const item of plan.scheduled_items) {
    const tStart = new Date(item.start_at).getTime();
    const tEnd = new Date(item.end_at).getTime();
    const bStart = examStart.getTime();
    const bEnd = examEnd.getTime();
    const overlaps = tStart < bEnd && tEnd > bStart;
    assert.ok(!overlaps, `Scheduled task ${item.title} must NOT overlap with exam busy block!`);
  }
  console.log('✓ Verified: Zero scheduled tasks overlap with the registered busy exam block');

  // 5. Test Confirmation with Stale Revision Fence Conflict
  console.log('5. Testing confirmation revision fence conflict...');
  const staleConflictRes = await fetch(`${BASE_URL}/api/plan/confirm`, {
    method: 'POST',
    headers: { Cookie: cookieHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan_id: plan.id,
      availability_revision: newAvailRevision + 999, // Stale revision
    }),
  });
  assert.equal(staleConflictRes.status, 409, 'Stale availability revision must return 409 Conflict');
  console.log('✓ Revision fence enforced: Stale confirmation rejected with HTTP 409 Conflict');

  // 6. Confirm Valid Plan
  console.log('6. Confirming valid weekly plan draft...');
  const confirmRes = await fetch(`${BASE_URL}/api/plan/confirm`, {
    method: 'POST',
    headers: { Cookie: cookieHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan_id: plan.id,
      availability_revision: newAvailRevision,
    }),
  });
  assert.equal(confirmRes.status, 200, 'POST /api/plan/confirm must return 200');
  const confirmData = await confirmRes.json();
  assert.equal(confirmData.status, 'confirmed', 'Plan status must be confirmed');
  console.log(`✓ Plan confirmed successfully. Tasks created: ${confirmData.tasks_created}`);

  // 7. Test Repeated Confirmation Idempotency
  console.log('7. Testing repeated confirmation idempotency...');
  const repeatConfirmRes = await fetch(`${BASE_URL}/api/plan/confirm`, {
    method: 'POST',
    headers: { Cookie: cookieHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan_id: plan.id,
      availability_revision: newAvailRevision,
    }),
  });
  assert.equal(repeatConfirmRes.status, 200, 'Repeated confirmation must return 200');
  const repeatData = await repeatConfirmRes.json();
  assert.equal(repeatData.status, 'already_confirmed', 'Repeated confirmation must return already_confirmed');
  console.log('✓ Repeated confirmation idempotent (returned already_confirmed without duplicating tasks)');

  // 8. Re-fetch GET /api/plan to verify persisted active plan and planned tasks
  console.log('8. Verifying persisted workspace state via GET /api/plan...');
  const verifyRes = await fetch(`${BASE_URL}/api/plan`, {
    headers: { Cookie: cookieHeader },
  });
  assert.equal(verifyRes.status, 200);
  const verifyData = await verifyRes.json();
  assert.equal(verifyData.activePlan?.id, plan.id, 'Active plan must match confirmed plan ID');
  assert.equal(verifyData.activePlan?.status, 'confirmed', 'Active plan must be confirmed');
  assert.equal(verifyData.plannedTasks.length, confirmData.tasks_created, 'Planned tasks count must match created count');
  console.log(`✓ Confirmed plan and ${verifyData.plannedTasks.length} planned tasks loaded cleanly in user workspace`);

  console.log('\n=== ALL SLICE S6 LIVE PLANNER FLOW TESTS PASSED ===');
}

run().catch((err) => {
  console.error('\n❌ LIVE FLOW TEST FAILED:', err);
  process.exit(1);
});
