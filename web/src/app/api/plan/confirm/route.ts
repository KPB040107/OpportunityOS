import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(
    { error: 'FEATURE_RETIRED', message: 'The Weekly Plan feature has been retired per PRD A-05.' },
    { status: 410 }
  );
}
