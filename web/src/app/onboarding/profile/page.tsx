import { requireUser } from '@/lib/auth';
import { ProfileOnboardingView } from './profile-onboarding-view';
import type { Skill } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function OnboardingProfilePage() {
  const { supabase, user } = await requireUser();

  const [profileRes, skillsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('profile_skills').select('level, skills(name)').eq('user_id', user.id)
  ]);

  const skillRows: Skill[] = (skillsRes.data || []).map((row) => ({
    name: (row.skills as unknown as { name: string })?.name || '',
    level: row.level as Skill['level']
  }));

  return (
    <ProfileOnboardingView
      currentProfile={profileRes.data}
      currentSkills={skillRows}
    />
  );
}
