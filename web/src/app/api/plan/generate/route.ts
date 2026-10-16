import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateWeeklyPlan } from '@/lib/planner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => ({}));
    const rawWeekStart = body.plan_week_start || body.weekStart;
    if (rawWeekStart && (!/^\d{4}-\d{2}-\d{2}$/.test(rawWeekStart) || isNaN(new Date(rawWeekStart).getTime()))) {
      return NextResponse.json(
        { error: 'INVALID_DATE', message: 'plan_week_start must be a valid date in YYYY-MM-DD format.' },
        { status: 400 }
      );
    }
    const weekStart = rawWeekStart || new Date().toISOString().slice(0, 10);
    const customEstimates = body.customEstimates || {};
    const priorities = body.priorities || {};

    // 1. Fetch user availability
    const { data: avail } = await supabase
      .from('user_availability')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    const availability = avail || {
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

    // 2. Fetch profile revision
    const { data: profile } = await supabase
      .from('profiles')
      .select('revision')
      .eq('user_id', user.id)
      .maybeSingle();

    const profileRevision = profile?.revision ?? 1;

    // 3. Fetch owned opportunities with their match status
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

    const candidates = (oppsRes.data || []).map((o) => {
      const match = matchesMap.get(o.id);
      return {
        id: o.id,
        title: o.title || 'Untitled Opportunity',
        organization: o.organization || '',
        deadline: o.deadline, // Date-only or ISO string preserved as-is
        type: o.type,
        match_score: match?.match_score ?? null,
        eligibility: match ? match.eligibility_status : 'UNKNOWN',
        trust_tier: o.trust_tier || 'unverified',
        risk_flags: o.risk_signals || [],
        match_revision: match?.revision ?? null,
      };
    });

    // 4. Generate deterministic weekly plan
    const planResult = generateWeeklyPlan({
      candidates,
      availability,
      weekStart,
      profileRevision,
      customEstimates,
      priorities,
    });

    // 5. Store draft in public.weekly_plans
    const { data: planRow, error: planErr } = await supabase
      .from('weekly_plans')
      .insert({
        user_id: user.id,
        plan_week_start: weekStart,
        contract_version: planResult.contract_version,
        algorithm_version: planResult.algorithm_version,
        profile_revision: profileRevision,
        availability_revision: availability.revision || 1,
        status: 'draft',
        scheduled_items: planResult.scheduled_items,
        unscheduled_items: planResult.unscheduled_items,
        pressure_notes: planResult.pressure_notes,
      })
      .select('id')
      .single();

    if (planErr || !planRow) {
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: planErr?.message || 'Failed to save plan draft.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        plan_id: planRow.id,
        plan: {
          id: planRow.id,
          status: 'draft',
          ...planResult,
        },
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return NextResponse.json({ error: 'INTERNAL_ERROR', message }, { status: 500 });
  }
}
