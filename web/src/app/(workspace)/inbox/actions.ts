'use server';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {requireUser} from '@/lib/auth';
import type {FormState} from '@/lib/types';

export async function retryAnalysis(_state:FormState,form:FormData):Promise<FormState>{
  const id=z.uuid().safeParse(form.get('raw_item_id'));
  if(!id.success)return {error:'Invalid submission.'};
  const {supabase}=await requireUser();
  const {error}=await supabase.rpc('retry_understand_item',{p_id:id.data});
  if(error)return {error:'Could not retry this submission. Only the original failed item can be retried, up to twice. You can also submit corrected text.'};
  revalidatePath('/inbox');revalidatePath('/activity');
  return {success:'Retry queued. Analysis will update here when it finishes.'};
}

export async function toggleSaveAction(opportunityId: string): Promise<{ success: boolean; is_saved?: boolean; error?: string }> {
  const parsed = z.string().uuid().safeParse(opportunityId);
  if (!parsed.success) return { success: false, error: 'Invalid opportunity ID' };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc('toggle_opportunity_save', { p_opportunity_id: parsed.data });
  if (error) return { success: false, error: error.message };
  revalidatePath('/inbox');
  return { success: true, is_saved: !!data };
}

export async function toggleHideAction(opportunityId: string): Promise<{ success: boolean; is_hidden?: boolean; error?: string }> {
  const parsed = z.string().uuid().safeParse(opportunityId);
  if (!parsed.success) return { success: false, error: 'Invalid opportunity ID' };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc('toggle_opportunity_hide', { p_opportunity_id: parsed.data });
  if (error) return { success: false, error: error.message };
  revalidatePath('/inbox');
  return { success: true, is_hidden: !!data };
}

export async function setSourcePreferenceAction(source: string, preference: 'normal'|'reduced'|'muted'): Promise<{ success: boolean; error?: string }> {
  const parsed = z.object({
    source: z.string().min(1).max(200),
    preference: z.enum(['normal', 'reduced', 'muted'])
  }).safeParse({ source, preference });
  if (!parsed.success) return { success: false, error: 'Invalid source or preference' };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('set_source_preference', { p_source: parsed.data.source, p_preference: parsed.data.preference });
  if (error) return { success: false, error: error.message };
  revalidatePath('/inbox');
  return { success: true };
}
