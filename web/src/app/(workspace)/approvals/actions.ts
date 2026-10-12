'use server';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';

export async function resolveApprovalAction(approvalId: string, outcome: 'approved' | 'rejected', reason?: string) {
  if (!['approved', 'rejected'].includes(outcome)) {
    throw new Error('Invalid outcome: must be approved or rejected');
  }

  const { supabase, user } = await requireUser();

  // First fetch the approval to get any execution resume_url
  const { data: approval, error: fetchErr } = await supabase
    .from('approvals')
    .select('id, resume_url, status')
    .eq('id', approvalId)
    .eq('user_id', user.id)
    .single();

  if (fetchErr || !approval) {
    throw new Error('Approval request not found');
  }

  if (approval.status !== 'pending') {
    return { success: false, message: `Already resolved as ${approval.status}` };
  }

  // Call atomic resolve_approval function
  const { error } = await supabase.rpc('resolve_approval', {
    p_approval_id: approvalId,
    p_outcome: outcome,
    p_reason: reason || `Resolved via Approval Center as ${outcome}`
  });

  if (error) {
    throw new Error(`Failed to resolve approval: ${error.message}`);
  }

  // If there is an n8n Wait node resume URL, notify n8n to resume the paused run
  if (approval.resume_url) {
    try {
      const url = new URL(approval.resume_url);
      url.searchParams.set('decision', outcome === 'approved' ? 'approve' : 'reject');
      await fetch(url.toString(), { method: 'GET', signal: AbortSignal.timeout(4000) });
    } catch {
      // Non-blocking: database state is already authoritative
    }
  }

  // Log resolution event
  await supabase.from('events').insert({
    user_id: user.id,
    stage: 'approval',
    level: 'info',
    message: `Human approval resolved: ${outcome}`,
    related_ids: { approval_id: approvalId }
  });

  revalidatePath('/approvals');
  revalidatePath('/applications');
  revalidatePath('/inbox');
  return { success: true, outcome };
}
