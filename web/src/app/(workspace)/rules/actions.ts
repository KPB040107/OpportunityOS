'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';

export async function recordDecisionAction(
  opportunityId: string,
  choice: 'approve' | 'reject' | 'ignore' | 'pin',
  reason?: string,
  isSeeded: boolean = false
) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase.rpc('record_student_decision', {
    p_opportunity_id: opportunityId,
    p_choice: choice,
    p_reason: reason || null,
    p_is_seeded: isSeeded
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/inbox');
  revalidatePath('/rules');
  revalidatePath(`/opportunities/${opportunityId}`);

  return { success: true, data };
}

export async function respondRuleAction(
  ruleId: string,
  action: 'approve' | 'reject' | 'disable'
) {
  const { supabase } = await requireUser();

  const { data, error } = await supabase.rpc('respond_standing_rule', {
    p_rule_id: ruleId,
    p_action: action
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/inbox');
  revalidatePath('/rules');

  return { success: true, data };
}
