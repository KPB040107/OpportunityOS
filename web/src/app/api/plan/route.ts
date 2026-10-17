import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { error: 'FEATURE_RETIRED', message: 'The Weekly Plan feature has been retired per PRD A-05. Please use Applications tracking and calendar sync.' },
    { status: 410 }
  );
}

export async function POST() {
  return NextResponse.json(
    { error: 'FEATURE_RETIRED', message: 'The Weekly Plan feature has been retired per PRD A-05. Please use Applications tracking and calendar sync.' },
    { status: 410 }
  );
}
