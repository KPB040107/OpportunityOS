import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest) {
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
    const { weekly_budget_hours, working_windows, busy_blocks, timezone } = body;

    const budget = weekly_budget_hours !== undefined ? Number(weekly_budget_hours) : 10.0;
    if (isNaN(budget) || budget < 1.0 || budget > 60.0) {
      return NextResponse.json(
        { error: 'INVALID_BUDGET', message: 'Weekly budget must be a number between 1.0 and 60.0 hours.' },
        { status: 400 }
      );
    }

    if (working_windows !== undefined && !Array.isArray(working_windows)) {
      return NextResponse.json(
        { error: 'INVALID_PAYLOAD', message: 'working_windows must be an array.' },
        { status: 400 }
      );
    }

    if (busy_blocks !== undefined && !Array.isArray(busy_blocks)) {
      return NextResponse.json(
        { error: 'INVALID_PAYLOAD', message: 'busy_blocks must be an array.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc('save_user_availability', {
      p_budget_hours: budget,
      p_working_windows: working_windows ?? [],
      p_busy_blocks: busy_blocks ?? [],
      p_timezone: timezone ?? 'Asia/Kolkata',
    });

    if (error) {
      const isClientErr = error.message.includes('INVALID_BUDGET');
      return NextResponse.json(
        { error: isClientErr ? 'INVALID_BUDGET' : 'AVAILABILITY_SAVE_FAILED', message: error.message },
        { status: isClientErr ? 400 : 500 }
      );
    }

    return NextResponse.json({ success: true, availability: data }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return NextResponse.json({ error: 'INTERNAL_ERROR', message }, { status: 500 });
  }
}
