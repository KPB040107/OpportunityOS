import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAllowedCaptureOrigin } from '@/lib/capture';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const verifySchema = z.object({
  nonce: z.string().uuid(),
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
    return NextResponse.json({ error: 'Please sign in to capture opportunities.' }, { status: 401, headers: corsHeaders });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400, headers: corsHeaders });
  }

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Valid UUID nonce, request_id, and payload_hash are required.' }, { status: 400, headers: corsHeaders });
  }

  const { data, error } = await supabase.rpc('redeem_capture_nonce', {
    p_nonce: parsed.data.nonce,
    p_request_id: parsed.data.request_id,
    p_payload_hash: parsed.data.payload_hash
  });

  if (error) {
    return NextResponse.json({ error: 'Database verification failed: ' + error.message }, { status: 500, headers: corsHeaders });
  }

  if (!data?.valid) {
    return NextResponse.json(
      { error: data?.error || 'Invalid or expired capture nonce.', valid: false },
      { status: 403, headers: corsHeaders }
    );
  }

  return NextResponse.json({ valid: true, is_retry: data.is_retry || false }, { status: 200, headers: corsHeaders });
}
