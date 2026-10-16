import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
    const { plan_id, expected_availability_revision } = body;
    const expectedRev = expected_availability_revision ?? body.availability_revision ?? 1;

    if (!plan_id) {
      return NextResponse.json(
        { error: 'MISSING_PLAN_ID', message: 'plan_id is required.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc('confirm_weekly_plan', {
      p_plan_id: plan_id,
      p_expected_availability_revision: expectedRev,
    });

    if (error) {
      if (error.message.includes('OUTDATED_AVAILABILITY_REVISION')) {
        return NextResponse.json(
          {
            error: 'OUTDATED_AVAILABILITY_REVISION',
            message: 'Your availability settings changed since this draft was generated. Please regenerate your plan.',
          },
          { status: 409 }
        );
      }
      if (error.message.includes('OUTDATED_PROFILE_REVISION')) {
        return NextResponse.json(
          {
            error: 'OUTDATED_PROFILE_REVISION',
            message: 'Your profile changed since this draft was generated. Please regenerate your plan.',
          },
          { status: 409 }
        );
      }
      if (error.message.includes('STALE_PLAN_CANDIDATE')) {
        return NextResponse.json(
          {
            error: 'STALE_PLAN_CANDIDATE',
            message: error.message,
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: 'CONFIRMATION_FAILED', message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, ...data }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return NextResponse.json({ error: 'INTERNAL_ERROR', message }, { status: 500 });
  }
}
