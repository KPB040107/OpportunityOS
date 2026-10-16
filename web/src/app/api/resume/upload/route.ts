import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { extractText } from 'unpdf';
import { createClient } from '@/lib/supabase/server';
import {
  validatePdfBuffer,
  sanitizeResumeText,
  extractDraftFromText,
  reconcileDraftWithProfile,
} from '@/lib/resume';

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
        { error: 'UNAUTHENTICATED', message: 'Authentication required to upload resume.' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'MISSING_FILE', message: 'No file was provided in the upload request.' },
        { status: 400 }
      );
    }

    // 1. Validate file size and type
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'PDF_TOO_LARGE', message: 'Resume PDF exceeds the 5 MiB size limit.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Validate PDF signature, encryption and executable content
    try {
      validatePdfBuffer(buffer);
    } catch (valErr: unknown) {
      const msg = valErr instanceof Error ? valErr.message : 'Invalid PDF file.';
      return NextResponse.json({ error: 'INVALID_PDF', message: msg }, { status: 400 });
    }

    // 3. Extract text per page with unpdf
    let textResult;
    try {
      textResult = await extractText(new Uint8Array(arrayBuffer), { mergePages: false });
    } catch (parseErr: unknown) {
      const msg = parseErr instanceof Error ? parseErr.message : 'Failed to parse PDF text.';
      return NextResponse.json(
        { error: 'PDF_PARSE_FAILED', message: `Could not parse PDF: ${msg}` },
        { status: 400 }
      );
    }

    if (!textResult || textResult.totalPages === 0) {
      return NextResponse.json(
        { error: 'PDF_EMPTY', message: 'The uploaded PDF contains no readable pages.' },
        { status: 400 }
      );
    }

    if (textResult.totalPages > 10) {
      return NextResponse.json(
        { error: 'PDF_TOO_MANY_PAGES', message: `PDF has ${textResult.totalPages} pages; maximum allowed is 10.` },
        { status: 400 }
      );
    }

    const pagesText = Array.isArray(textResult.text) ? textResult.text : [textResult.text];
    const combinedRawText = pagesText.join('\n');
    const sanitizedText = sanitizeResumeText(combinedRawText);

    if (sanitizedText.trim().length < 50) {
      return NextResponse.json(
        {
          error: 'PDF_SCANNED_OR_EMPTY',
          message: 'The PDF has less than 50 characters of extractable text. Scanned or image-only PDFs are not supported.',
        },
        { status: 400 }
      );
    }

    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // 4. Fetch user's current profile and skills
    const [profileRes, skillsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('profile_skills').select('level, skills(name)').eq('user_id', user.id),
    ]);

    const currentProfile = profileRes.data || { revision: 0 };
    const currentSkills = (skillsRes.data || []).map((row) => ({
      skill: (row.skills as unknown as { name: string })?.name || '',
      level: row.level,
    }));
    const profileWithSkills = {
      ...currentProfile,
      skills: currentSkills,
    };

    // 5. Extract draft fields and skills (strictly null level for new skills)
    const draft = extractDraftFromText(sanitizedText, 1, currentProfile.revision ?? 0);
    const reconciled = reconcileDraftWithProfile(profileWithSkills, draft);

    // 6. Upload PDF buffer to Supabase private Storage bucket 'resumes'
    const objectPath = `${user.id}/${fileHash.slice(0, 16)}.pdf`;
    const storagePath = `resumes/${objectPath}`;

    const { error: storageErr } = await supabase.storage
      .from('resumes')
      .upload(objectPath, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (storageErr) {
      return NextResponse.json(
        { error: 'STORAGE_ERROR', message: `Failed to upload PDF to private storage: ${storageErr.message}` },
        { status: 500 }
      );
    }

    // Verify object exists in storage
    const { data: objectList, error: listErr } = await supabase.storage
      .from('resumes')
      .list(user.id, { search: `${fileHash.slice(0, 16)}.pdf` });

    if (listErr || !objectList || objectList.length === 0) {
      return NextResponse.json(
        { error: 'STORAGE_VERIFICATION_FAILED', message: 'Failed to verify uploaded object in private storage.' },
        { status: 500 }
      );
    }

    // 7. Record upload in public.resume_uploads
    const { data: uploadData, error: uploadErr } = await supabase
      .from('resume_uploads')
      .insert({
        user_id: user.id,
        storage_path: storagePath,
        file_name: file.name,
        file_size: file.size,
        file_sha256: fileHash,
        status: 'draft_ready',
        page_count: textResult.totalPages,
        extracted_text: sanitizedText,
      })
      .select('id')
      .single();

    if (uploadErr || !uploadData) {
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: `Failed to record resume upload: ${uploadErr?.message}` },
        { status: 500 }
      );
    }

    // 8. Record draft in public.profile_drafts
    const { data: draftData, error: draftErr } = await supabase
      .from('profile_drafts')
      .insert({
        user_id: user.id,
        resume_upload_id: uploadData.id,
        base_profile_revision: currentProfile.revision ?? 0,
        contract_version: draft.contract_version,
        proposed_fields: draft.fields,
        proposed_skills: draft.skills,
        missing_fields: draft.missing_fields,
        status: 'draft_ready',
      })
      .select('id')
      .single();

    if (draftErr || !draftData) {
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: `Failed to record profile draft: ${draftErr?.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        upload_id: uploadData.id,
        draft_id: draftData.id,
        draft,
        reconciled,
        totalPages: textResult.totalPages,
        fileName: file.name,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return NextResponse.json({ error: 'INTERNAL_ERROR', message }, { status: 500 });
  }
}
