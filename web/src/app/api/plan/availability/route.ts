import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    { error: 'FEATURE_RETIRED', message: 'The Weekly Plan feature has been retired per PRD A-05.' },
    { status: 410 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'FEATURE_RETIRED', message: 'The Weekly Plan feature has been retired per PRD A-05.' },
    { status: 410 }
  );
}
