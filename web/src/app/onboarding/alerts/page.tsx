import { requireUser } from '@/lib/auth';
import { AlertsView } from './alerts-view';

export const dynamic = 'force-dynamic';

export default async function OnboardingAlertsPage() {
  const { supabase, user } = await requireUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('email_notifications_enabled, calendar_sync_enabled, autonomy_mode')
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <AlertsView
      initialEmail={profile?.email_notifications_enabled ?? true}
      initialCalendar={profile?.calendar_sync_enabled ?? false}
      initialMode={profile?.autonomy_mode ?? 'balanced'}
    />
  );
}
