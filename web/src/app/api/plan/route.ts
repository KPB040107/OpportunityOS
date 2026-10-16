import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { PlannedTask } from '@/lib/planner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHENTICATED', message: 'Authentication required.' },
        { status: 401 }
      );
    }

    // 1. Fetch user availability (or seed default if first time)
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

    // 2. Fetch current week's latest plan
    const { data: plans } = await supabase
      .from('weekly_plans')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    const activePlan = plans?.[0] || null;

    // 3. Fetch planned tasks if a confirmed plan exists
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

    // 4. Fetch candidate opportunities with match status
    const [oppsRes, matchesRes] = await Promise.all([
      supabase
        .from('opportunities')
        .select('id, title, organization, deadline, type, trust_tier, ambiguity_flags, risk_signals')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('matches')
        .select('opportunity_id, decision, eligibility_status, match_score, confidence, status, revision')
        .eq('user_id', user.id)
        .eq('status', 'complete'),
    ]);

    const matchesMap = new Map((matchesRes.data || []).map((m) => [m.opportunity_id, m]));

    const candidateList = (oppsRes.data || []).map((o) => {
      const match = matchesMap.get(o.id);
      return {
        id: o.id,
        title: o.title || 'Untitled Opportunity',
        organization: o.organization || '',
        deadline: o.deadline,
        type: o.type,
        match_score: match?.match_score ?? null,
        eligibility: match ? match.eligibility_status : 'UNKNOWN',
        trust_tier: o.trust_tier || 'unverified',
        risk_flags: o.risk_signals || [],
        match_revision: match?.revision ?? null,
      };
    });

    return NextResponse.json({
      availability: avail,
      activePlan,
      plannedTasks,
      candidates: candidateList,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return NextResponse.json({ error: 'INTERNAL_ERROR', message }, { status: 500 });
  }
}
