-- Migration 0039: Resume Storage Bucket, Object Policies, and Processing Support
-- Provides private, authenticated Supabase Storage bucket 'resumes' with owner-only RLS,
-- ensuring PDF files are stored privately and can be scrubbed per D9 privacy retention.

begin;

-- 1. Create resumes bucket in storage.buckets if not exists
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 5242880, array['application/pdf']::text[])
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['application/pdf']::text[];

-- 2. Storage RLS Policies on storage.objects for 'resumes' bucket
-- Authenticated users can only read, write, and delete objects in their own folder (auth.uid())
drop policy if exists "resumes_owner_select" on storage.objects;
create policy "resumes_owner_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'resumes' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or name like (auth.uid()::text || '/%')
    )
  );

drop policy if exists "resumes_owner_insert" on storage.objects;
create policy "resumes_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'resumes' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or name like (auth.uid()::text || '/%')
    )
  );

drop policy if exists "resumes_owner_update" on storage.objects;
create policy "resumes_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'resumes' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or name like (auth.uid()::text || '/%')
    )
  )
  with check (
    bucket_id = 'resumes' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or name like (auth.uid()::text || '/%')
    )
  );

drop policy if exists "resumes_owner_delete" on storage.objects;
create policy "resumes_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'resumes' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or name like (auth.uid()::text || '/%')
    )
  );

commit;
