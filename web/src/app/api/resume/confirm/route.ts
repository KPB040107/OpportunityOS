import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateConfirmationPayload } from '@/lib/resume';

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
        { error: 'UNAUTHENTICATED', message: 'Authentication required to confirm profile draft.' },
        { status: 401 }
      );
    }

    const body = await request.json();

    try {
      validateConfirmationPayload(body);
    } catch (valErr: unknown) {
      const msg = valErr instanceof Error ? valErr.message : 'Invalid confirmation payload.';
      return NextResponse.json({ error: 'INVALID_PAYLOAD', message: msg }, { status: 400 });
    }

    // Lookup associated upload storage path before confirmation
    const { data: draftRecord } = await supabase
      .from('profile_drafts')
      .select('resume_upload_id, resume_uploads(storage_path)')
      .eq('id', body.draft_id)
      .eq('user_id', user.id)
      .maybeSingle();

    const { data, error } = await supabase.rpc('confirm_profile_draft', {
      p_draft_id: body.draft_id,
      p_selected_fields: body.selected_fields,
      p_skills_with_levels: body.skills_with_levels,
      p_expected_revision: body.expected_revision,
      p_projects: body.projects ?? [],
      p_consents: body.consents ?? {},
    });

    if (error) {
      if (error.message.includes('OUTDATED_PROFILE_REVISION')) {
        return NextResponse.json(
          {
            error: 'OUTDATED_PROFILE_REVISION',
            message: 'Your profile has changed since this draft was extracted. Please review the updated profile.',
          },
          { status: 409 }
        );
      }

      if (error.message.includes('DRAFT_NOT_ACTIONABLE')) {
        return NextResponse.json(
          { error: 'DRAFT_NOT_ACTIONABLE', message: 'This draft is no longer pending confirmation.' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'CONFIRMATION_FAILED', message: error.message },
        { status: 500 }
      );
    }

    // Privacy D9 retention: remove physical file from private Supabase Storage
    try {
      const rawPath = (draftRecord?.resume_uploads as unknown as { storage_path?: string })?.storage_path;
      if (rawPath) {
        const objectPath = rawPath.startsWith('resumes/') ? rawPath.slice('resumes/'.length) : rawPath;
        await supabase.storage.from('resumes').remove([objectPath]);
      }
    } catch (cleanupErr) {
      console.warn('Storage removal warning during confirmation:', cleanupErr);
    }

    // Backfill matching opportunities from discovery catalog for the confirmed profile
    try {
      await supabase.rpc('catch_up_discovery_catalog');
    } catch (catchUpErr) {
      console.warn('Catalog catch-up warning after resume confirmation:', catchUpErr);
    }

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return NextResponse.json({ error: 'INTERNAL_ERROR', message }, { status: 500 });
  }
}
