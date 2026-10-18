'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

export async function saveAlertPreferencesAction(formData: FormData) {
  const { supabase, user } = await requireUser();

  const emailAlerts = formData.get('emailAlerts') === 'true';
  const calendarSync = formData.get('calendarSync') === 'true';
  const autonomyMode = String(formData.get('autonomyMode') || 'balanced');

  const validMode = ['cautious', 'balanced', 'autopilot'].includes(autonomyMode)
    ? autonomyMode
    : 'balanced';

  const { error } = await supabase.rpc('save_onboarding_preferences', {
    p_email_alerts: emailAlerts,
    p_calendar_sync: calendarSync,
    p_autonomy_mode: validMode
  });

  if (error) {
    console.error('Failed to update alert preferences via RPC, attempting fallback update:', error);
    await supabase
      .from('profiles')
      .update({
        email_notifications_enabled: emailAlerts,
        calendar_sync_enabled: calendarSync,
        autonomy_mode: validMode,
        consent_recorded_at: new Date().toISOString()
      })
      .eq('user_id', user.id);
  }

  redirect('/onboarding/done');
}
