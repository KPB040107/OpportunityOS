import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAllowedCaptureOrigin } from '@/lib/capture';
import { z } from 'zod';

const verifySchema = z.object({
  nonce: z.string().uuid(),
  request_id: z.string().uuid(),
  payload_hash: z.string().min(16).max(128)
}).strict();

export async function POST(request: NextRequest) {
  const reqOrigin = request.headers.get('origin') || '';
  if (!isAllowedCaptureOrigin(reqOrigin, request)) {
    return NextResponse.json({ error: 'Request origin not allowed.' }, { status: 403 });
  }

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

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Valid UUID nonce, request_id, and payload_hash are required.' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('redeem_capture_nonce', {
    p_nonce: parsed.data.nonce,
    p_request_id: parsed.data.request_id,
    p_payload_hash: parsed.data.payload_hash
  });

  if (error) {
    return NextResponse.json({ error: 'Database verification failed: ' + error.message }, { status: 500 });
  }

  if (!data?.valid) {
    return NextResponse.json(
      { error: data?.error || 'Invalid or expired capture nonce.', valid: false },
      { status: 403 }
    );
  }

  return NextResponse.json({ valid: true, is_retry: data.is_retry || false }, { status: 200 });
}
