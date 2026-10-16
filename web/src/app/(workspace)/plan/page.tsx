import { requireUser } from '@/lib/auth';
import { PlanClient } from './plan-client';
import type { UserAvailability, OpportunityCandidate, PlannedTask } from '@/lib/planner';

export default async function WeeklyPlanPage() {
  const { supabase, user } = await requireUser();

  // 1. Fetch user availability (or create default)
  let { data: avail } = await supabase
    .from('user_availability')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!avail) {
    const defaultAvail = {
      user_id: user.id,
      weekly_budget_hours: 10.0,
      working_windows: [
        { day: 1, start: '09:00', end: '12:00' },
        { day: 2, start: '09:00', end: '12:00' },
        { day: 3, start: '09:00', end: '12:00' },
        { day: 4, start: '09:00', end: '12:00' },
        { day: 5, start: '09:00', end: '12:00' },
      ],
      busy_blocks: [],
      timezone: 'Asia/Kolkata',
      revision: 1,
    };

    const { data: inserted } = await supabase
      .from('user_availability')
      .insert(defaultAvail)
      .select('*')
      .single();
    avail = inserted;
  }

  // 2. Fetch current active plan
  const { data: plans } = await supabase
    .from('weekly_plans')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1);

  const activePlan = plans?.[0] || null;

  // 3. Fetch planned tasks if plan is confirmed
  let plannedTasks: PlannedTask[] = [];
  if (activePlan && activePlan.status === 'confirmed') {
    const { data: tasks } = await supabase
      .from('planned_tasks')
      .select('*')
      .eq('plan_id', activePlan.id)
      .eq('user_id', user.id)
      .order('start_at', { ascending: true });
    plannedTasks = (tasks || []) as PlannedTask[];
  }

  // 4. Fetch candidate opportunities
  const { data: opps } = await supabase
    .from('opportunities')
    .select('id, title, organization, deadline, type')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const candidates: OpportunityCandidate[] = (opps || []).map((o) => ({
    id: o.id,
    title: o.title || 'Untitled Opportunity',
    organization: o.organization || '',
    deadline: o.deadline,
    type: o.type,
    eligibility: 'ELIGIBLE',
  }));

  const initialAvailability: UserAvailability = {
    weekly_budget_hours: avail?.weekly_budget_hours ?? 10.0,
    working_windows: avail?.working_windows ?? [],
    busy_blocks: avail?.busy_blocks ?? [],
    timezone: avail?.timezone ?? 'Asia/Kolkata',
    revision: avail?.revision ?? 1,
  };

  return (
    <PlanClient
      initialAvailability={initialAvailability}
      initialPlan={activePlan}
      initialTasks={plannedTasks}
      candidates={candidates}
    />
  );
}
