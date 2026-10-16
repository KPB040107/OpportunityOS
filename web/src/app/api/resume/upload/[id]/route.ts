import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'MISSING_ID', message: 'Upload ID is required.' }, { status: 400 });
    }

    // Retrieve storage path before marking deleted
    const { data: uploadRecord } = await supabase
      .from('resume_uploads')
      .select('storage_path')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (uploadRecord?.storage_path) {
      try {
        const rawPath = uploadRecord.storage_path;
        const objectPath = rawPath.startsWith('resumes/') ? rawPath.slice('resumes/'.length) : rawPath;
        await supabase.storage.from('resumes').remove([objectPath]);
      } catch (storageErr) {
        console.warn('Storage deletion warning:', storageErr);
      }
    }

    const { data, error } = await supabase.rpc('delete_resume_upload', {
      p_upload_id: id,
    });

    if (error) {
      return NextResponse.json({ error: 'DATABASE_ERROR', message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return NextResponse.json({ error: 'INTERNAL_ERROR', message }, { status: 500 });
  }
}
