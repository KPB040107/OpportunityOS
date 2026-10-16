'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { publicUrl } from '@/lib/validation';
import { z } from 'zod';

export async function toggleSource(sourceId: string, currentEnabled: boolean) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from('sources')
    .update({ enabled: !currentEnabled, updated_at: new Date().toISOString() })
    .eq('id', sourceId)
    .eq('user_id', user.id);

  if (error) {
    throw new Error('Failed to update source status: ' + error.message);
  }

  revalidatePath('/sources');
}

export async function seedPresetsAction() {
  const { supabase } = await requireUser();

  const { error } = await supabase.rpc('seed_my_sources');

  if (error) {
    throw new Error('Failed to seed preset sources: ' + error.message);
  }

  revalidatePath('/sources');
}

export async function addCustomSource(formData: FormData) {
  const { supabase, user } = await requireUser();

  const name = String(formData.get('name') || '').trim();
  const rawUrl = String(formData.get('url') || '').trim();
  let url = '';
  try {
    url = publicUrl(rawUrl);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Invalid URL';
    redirect(`/sources?error=${encodeURIComponent(msg)}`);
  }

  const type = (formData.get('type') as string) || 'page';
  const frequency = (formData.get('frequency') as string) || 'daily';
  const keywordsStr = (formData.get('keywords') as string) || '';

  if (!name || !url) {
    redirect('/sources?error=Name+and+URL+are+required');
  }
  if (!z.string().trim().min(1).max(100).safeParse(name).success || !['page', 'rss'].includes(type) || !['hourly', '6hours', 'daily', 'weekly'].includes(frequency)) {
    redirect('/sources?error=Check+the+source+settings');
  }

  const keywords = keywordsStr
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  const { error } = await supabase.from('sources').insert({
    user_id: user.id,
    name,
    url,
    type,
    frequency,
    keywords,
    enabled: true
  });

  if (error) {
    redirect(`/sources?error=${encodeURIComponent('Failed to add custom source: ' + error.message)}`);
  }

  revalidatePath('/sources');
  redirect('/sources?success=Source+added+successfully');
}
