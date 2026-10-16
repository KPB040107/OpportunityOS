import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { intakeSchema, publicUrl } from '@/lib/validation';
import { isAllowedCaptureOrigin } from '@/lib/capture';
import { createHash } from 'node:crypto';
import { z } from 'zod';

const resultSchema = z.object({
  raw_item_id: z.string().uuid(),
  processing_status: z.enum(['queued', 'processing', 'understood', 'failed']),
  was_created: z.boolean()
});

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
    return NextResponse.json({ error: 'Request not allowed.' }, { status: 403 });
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
    return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  }

  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json({ error: 'Use a JSON request.' }, { status: 415 });
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return NextResponse.json({ error: 'Content required.' }, { status: 400 });
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 90000) {
        await reader.cancel();
        return NextResponse.json({ error: 'Content is too long.' }, { status: 413 });
      }
      chunks.push(value);
    }
  } catch {
    return NextResponse.json({ error: 'Could not read the submission.' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'Invalid submission.' }, { status: 400 });
  }

  const parsed = intakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  // Cryptographic binding and single-use nonce validation for bookmarklet capture
  if (parsed.data.source_type === 'capture') {
    const computedHash = createHash('sha256').update(parsed.data.content).digest('hex');
    if (computedHash !== parsed.data.payload_hash) {
      return NextResponse.json(
        { error: 'Payload digest mismatch: content was modified after nonce issuance.' },
        { status: 400 }
      );
    }

    const { data: redeemData, error: redeemError } = await supabase.rpc('redeem_capture_nonce', {
      p_nonce: parsed.data.nonce,
      p_request_id: parsed.data.request_id,
      p_payload_hash: parsed.data.payload_hash
    });

    if (redeemError || !redeemData?.valid) {
      return NextResponse.json(
        { error: redeemData?.error || 'Invalid, expired, or already-used capture nonce.' },
        { status: 403 }
      );
    }
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  }

  const url = process.env.N8N_INGEST_URL;
  if (!url) {
    return NextResponse.json({ error: 'Intake is not connected yet. Please try later.' }, { status: 503 });
  }

  const content = parsed.data.source_type === 'url' ? publicUrl(parsed.data.content) : parsed.data.content;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ ...parsed.data, content }),
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
      redirect: 'error'
    });

    const result = await response.json();
    if (!response.ok || !resultSchema.safeParse(result).success) {
      return NextResponse.json(
        { error: response.status === 401 ? 'Please sign in again.' : 'The workflow could not confirm the save. Check your inbox before retrying.' },
        { status: response.status === 401 ? 401 : 502, headers: corsHeaders }
      );
    }

    // Persist capture metadata on raw_items if provided
    if (parsed.data.metadata && result.raw_item_id) {
      await supabase
        .from('raw_items')
        .update({ metadata: parsed.data.metadata })
        .eq('id', result.raw_item_id);
    }

    return NextResponse.json(
      { id: result.raw_item_id, status: result.processing_status },
      { status: 201, headers: corsHeaders }
    );
  } catch {
    return NextResponse.json(
      { error: 'The workflow did not confirm the save. Check your inbox, then retry this same submission if needed.' },
      { status: 503, headers: corsHeaders }
    );
  }
}
