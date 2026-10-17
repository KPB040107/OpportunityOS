import { requireUser } from '@/lib/auth';
import { ProfileForm } from './profile-form';
import { ResumeOnboardingCard } from '@/components/resume-onboarding-card';
import type { Skill, ProfileProject } from '@/lib/types';

export default async function ProfilePage() {
  const { supabase, user } = await requireUser();
  const [profileRes, skillsRes, projectsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('profile_skills').select('level, skills(name)').eq('user_id', user.id),
    supabase.from('profile_projects').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
  ]);

  if (profileRes.error || skillsRes.error) {
    throw new Error('Profile data unavailable');
  }

  const skillRows: Skill[] = (skillsRes.data || []).map((row) => ({
    name: (row.skills as unknown as { name: string })?.name || '',
    level: row.level as Skill['level'],
  }));

  const projects: ProfileProject[] = (projectsRes.data || []).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description || '',
    technologies: row.technologies || [],
    github_url: row.github_url || null,
    dates: row.dates || null,
    source: row.source || 'manual',
  }));

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Make it yours</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">My Profile</h1>
        <p className="mt-2 text-muted-foreground">
          Give your agent context. Upload your resume for 1-minute auto-population, or edit details directly below.
        </p>
      </div>

      {/* Slice S5 Resume Onboarding Card */}
      <ResumeOnboardingCard
        currentProfile={profileRes.data}
        currentSkills={skillRows}
      />

      <div className="border-t border-border pt-6">
        <h2 className="mb-4 text-xl font-semibold text-foreground">Manual Profile Settings</h2>
        <ProfileForm
          key={profileRes.data?.revision ?? 'empty'}
          profile={profileRes.data}
          skills={skillRows}
          projects={projects}
        />
      </div>
    </div>
  );
}
