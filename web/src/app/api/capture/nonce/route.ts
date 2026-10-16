import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAllowedCaptureOrigin } from '@/lib/capture';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const issueNonceSchema = z.object({
  request_id: z.string().uuid(),
  payload_hash: z.string().min(16).max(128)
}).strict();

export async function OPTIONS(request: NextRequest) {
  const reqOrigin = request.headers.get('origin') || '';
  if (!isAllowedCaptureOrigin(reqOrigin, request)) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': reqOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': 'true'
    }
  });
}

export async function POST(request: NextRequest) {
  const reqOrigin = request.headers.get('origin') || '';
  if (!isAllowedCaptureOrigin(reqOrigin, request)) {
    return NextResponse.json({ error: 'Request origin not allowed.' }, { status: 403 });
  }

  const corsHeaders: Record<string, string> = reqOrigin.startsWith('chrome-extension://')
    ? {
        'Access-Control-Allow-Origin': reqOrigin,
        'Access-Control-Allow-Credentials': 'true'
      }
    : {};

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Please sign in to capture opportunities.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const parsed = issueNonceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Valid UUID request_id and payload_hash are required.' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('issue_capture_nonce', {
    p_request_id: parsed.data.request_id,
    p_payload_hash: parsed.data.payload_hash
  });

  if (error || !data || data.error) {
    return NextResponse.json(
      { error: data?.error || 'Could not issue secure capture nonce. Please try again.' },
      { status: 500, headers: corsHeaders }
    );
  }

  return NextResponse.json(data, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      ...corsHeaders
    }
  });
}
