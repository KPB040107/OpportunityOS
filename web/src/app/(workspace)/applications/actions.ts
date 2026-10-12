'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import type { ApplicationStatus } from '@/lib/types';

const validStatuses: ApplicationStatus[] = ['saved', 'to_apply', 'applied', 'assessment', 'interview', 'offer', 'rejected'];

export async function updateApplicationStatus(id: string, status: string, notes?: string) {
  if (!validStatuses.includes(status as ApplicationStatus)) {
    throw new Error('Invalid application status');
  }

  const { supabase, user } = await requireUser();
  const updateData: { status: string; updated_at: string; notes?: string } = {
    status,
    updated_at: new Date().toISOString()
  };
  if (notes !== undefined) updateData.notes = notes;

  const { error } = await supabase
    .from('applications')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    throw new Error('Failed to update application status');
  }

  // Log status change event in timeline
  await supabase.from('events').insert({
    user_id: user.id,
    stage: 'tracker',
    level: 'info',
    message: `Application status changed to ${status.replace('_', ' ')}`,
    related_ids: { application_id: id }
  });

  revalidatePath('/applications');
  return { success: true };
}
