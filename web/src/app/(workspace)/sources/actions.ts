'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';

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
  const { supabase, user } = await requireUser();

  const { error } = await supabase.rpc('seed_default_sources', { p_user: user.id });

  if (error) {
    throw new Error('Failed to seed preset sources: ' + error.message);
  }

  revalidatePath('/sources');
}

export async function addCustomSource(formData: FormData) {
  const { supabase, user } = await requireUser();

  const name = formData.get('name') as string;
  const url = formData.get('url') as string;
  const type = (formData.get('type') as string) || 'page';
  const frequency = (formData.get('frequency') as string) || 'daily';
  const keywordsStr = (formData.get('keywords') as string) || '';

  if (!name || !url) {
    throw new Error('Name and URL are required');
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
    throw new Error('Failed to add custom source: ' + error.message);
  }

  revalidatePath('/sources');
}
