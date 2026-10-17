'use client';

import { useActionState, useState } from 'react';
import { Plus, X, Trash2, ExternalLink, Mail, Calendar, ShieldCheck, FolderGit2 } from 'lucide-react';
import { saveProfile } from './actions';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { activeInterestTypes, historicInterestTypes, splitSkillNames } from '@/lib/profile-utils';
import { createClient } from '@/lib/supabase/client';
import type { Profile, Skill, ProfileProject } from '@/lib/types';

interface ProfileFormProps {
  profile: Profile | null;
  skills: Skill[];
  projects?: ProfileProject[];
}

export function ProfileForm({ profile, skills, projects = [] }: ProfileFormProps) {
  const [entries, setEntries] = useState<Skill[]>(skills);
  const [projectList, setProjectList] = useState<ProfileProject[]>(projects);
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newTech, setNewTech] = useState('');
  const [newGithubUrl, setNewGithubUrl] = useState('');
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectSuccess, setProjectSuccess] = useState<string | null>(null);
  const [savingProject, setSavingProject] = useState(false);

  // Consent states with revocation controls (P-05)
  const [emailConsent, setEmailConsent] = useState(
    profile?.email_notifications_enabled ?? profile?.notifications_enabled ?? false
  );
  const [calendarConsent, setCalendarConsent] = useState(
    profile?.calendar_sync_enabled ?? false
  );
  const [consentMessage, setConsentMessage] = useState<string | null>(null);

  const [state, action, pending] = useActionState(saveProfile, {});

  const supabase = createClient();

  const academicFields = [
    { key: 'display_name', label: 'Your name', type: 'text' },
    { key: 'degree', label: 'Degree', type: 'text' },
    { key: 'branch', label: 'Branch / major', type: 'text' },
    { key: 'academic_year', label: 'Current academic year', type: 'number', min: 1, max: 8 },
    { key: 'graduation_year', label: 'Graduation year', type: 'number', min: 2000, max: 2100 },
    { key: 'cgpa', label: 'CGPA (out of 10)', type: 'number', min: 0, max: 10, step: '0.01' },
  ] as const;

  async function handleAddProject() {
    if (!newTitle.trim()) {
      setProjectError('Please enter a project title.');
      return;
    }

    if (newGithubUrl.trim() && !newGithubUrl.toLowerCase().includes('github.com')) {
      setProjectError('GitHub URL must be a valid github.com link.');
      return;
    }

    setSavingProject(true);
    setProjectError(null);
    setProjectSuccess(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('You must be logged in to save projects.');
      }

      const techArray = newTech
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const { data, error } = await supabase
        .from('profile_projects')
        .insert({
          user_id: user.id,
          title: newTitle.trim(),
          description: newDescription.trim(),
          technologies: techArray,
          github_url: newGithubUrl.trim() || null,
          source: 'manual',
        })
        .select()
        .single();

      if (error) {
        throw new Error(error.message);
      }

      setProjectList([
        {
          id: data.id,
          title: data.title,
          description: data.description || '',
          technologies: data.technologies || [],
          github_url: data.github_url || null,
          dates: data.dates || null,
          source: 'manual',
        },
        ...projectList,
      ]);

      setNewTitle('');
      setNewDescription('');
      setNewTech('');
      setNewGithubUrl('');
      setIsAddingProject(false);
      setProjectSuccess('Project added successfully.');
    } catch (err: unknown) {
      setProjectError(err instanceof Error ? err.message : 'Failed to add project.');
    } finally {
      setSavingProject(false);
    }
  }

  async function handleDeleteProject(id?: string, index?: number) {
    if (!id) {
      if (typeof index === 'number') {
        setProjectList(projectList.filter((_, i) => i !== index));
      }
      return;
    }

    try {
      const { error } = await supabase.from('profile_projects').delete().eq('id', id);
      if (error) {
        throw new Error(error.message);
      }
      setProjectList(projectList.filter((p) => p.id !== id));
      setProjectSuccess('Project removed.');
    } catch (err: unknown) {
      setProjectError(err instanceof Error ? err.message : 'Failed to delete project.');
    }
  }

  async function handleRevokeEmail() {
    setEmailConsent(false);
    try {
      await supabase.rpc('set_notification_preference', { p_enabled: false });
      setConsentMessage('Email notification consent has been revoked.');
    } catch {
      setConsentMessage('Email preference updated locally; save profile to sync.');
    }
  }

  function handleRevokeCalendar() {
    setCalendarConsent(false);
    setConsentMessage('Google Calendar sync permission has been revoked. Direct links and .ICS downloads will be provided instead.');
  }

  // Detect historic (retired) interest types in current profile (P-01)
  const userHistoricInterests = (profile?.interest_types || []).filter((t) =>
    historicInterestTypes.includes(t as unknown as typeof historicInterestTypes[number])
  );

  return (
    <form
      action={action}
      onSubmit={() => {
        const expanded = splitSkillNames(entries);
        if (expanded.length <= 30) setEntries(expanded);
      }}
      className="space-y-6"
    >
      {/* 1. Academic Details + Professional Experience (P-02) */}
      <Card className="p-6">
        <h2 className="mb-5 text-lg font-semibold text-foreground">Academic Details & Experience</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {academicFields.map(({ key, label, ...props }) => (
            <div className="space-y-2" key={key}>
              <label htmlFor={key} className="text-sm font-medium text-foreground">
                {label}
              </label>
              <Input
                {...props}
                id={key}
                name={key}
                maxLength={100}
                defaultValue={profile?.[key] ?? ''}
              />
            </div>
          ))}

          {/* Optional years of professional experience field (P-02) */}
          <div className="space-y-2 sm:col-span-2 lg:col-span-3 border-t border-border pt-4">
            <label htmlFor="years_of_experience" className="text-sm font-medium text-foreground">
              Years of professional experience (optional)
            </label>
            <div className="max-w-xs">
              <Input
                id="years_of_experience"
                name="years_of_experience"
                type="number"
                min={0}
                max={50}
                step="0.5"
                placeholder="e.g. 1.5"
                defaultValue={profile?.years_of_experience ?? ''}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Employment or industry experience. Do not calculate by counting academic or personal projects.
            </p>
          </div>
        </div>
      </Card>

      {/* 2. Projects Section (P-02) */}
      <Card className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FolderGit2 className="size-5 text-primary" />
              Your Projects
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Showcase personal, academic, or open-source projects with technologies and GitHub links.
            </p>
          </div>
          {!isAddingProject && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setIsAddingProject(true);
                setProjectError(null);
                setProjectSuccess(null);
              }}
            >
              <Plus className="mr-1 size-4" />
              Add project
            </Button>
          )}
        </div>

        {projectError && (
          <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600">
            {projectError}
          </div>
        )}

        {projectSuccess && (
          <div className="mb-4 rounded-lg border border-primary/20 bg-primary/10 p-3 text-xs text-primary">
            {projectSuccess}
          </div>
        )}

        {/* Add Project Subform */}
        {isAddingProject && (
          <div className="mb-6 rounded-xl border border-primary/30 bg-muted/20 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Add New Project</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsAddingProject(false)}
                className="h-7 px-2 text-xs"
              >
                <X className="size-3.5" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Project Title *</label>
                <Input
                  placeholder="e.g. Real-Time Analytics Pipeline"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  maxLength={120}
                  className="mt-1 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">GitHub URL (optional)</label>
                <Input
                  placeholder="https://github.com/username/project"
                  value={newGithubUrl}
                  onChange={(e) => setNewGithubUrl(e.target.value)}
                  maxLength={255}
                  className="mt-1 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Technologies (comma-separated)</label>
              <Input
                placeholder="e.g. Next.js, TypeScript, PostgreSQL, Tailwind CSS"
                value={newTech}
                onChange={(e) => setNewTech(e.target.value)}
                maxLength={200}
                className="mt-1 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea
                placeholder="Brief summary of architecture, scope, or accomplishments"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                maxLength={1000}
                className="mt-1 min-h-[70px] text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAddingProject(false)}
                disabled={savingProject}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleAddProject}
                disabled={savingProject}
              >
                {savingProject ? 'Saving...' : 'Save Project'}
              </Button>
            </div>
          </div>
        )}

        {/* Existing Projects List */}
        {projectList.length === 0 && !isAddingProject ? (
          <p className="text-sm text-muted-foreground italic">
            No projects added yet. Click &ldquo;Add project&rdquo; to showcase your work.
          </p>
        ) : (
          <div className="space-y-3">
            {projectList.map((project, idx) => (
              <div
                key={project.id || `proj-${idx}`}
                className="rounded-lg border border-border bg-card p-4 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-foreground text-sm">{project.title}</h4>
                      <span className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground uppercase font-medium">
                        {project.source || 'manual'}
                      </span>
                      {project.dates && (
                        <span className="text-[11px] text-muted-foreground">({project.dates})</span>
                      )}
                    </div>
                    {project.description && (
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                        {project.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {project.github_url && (
                      <a
                        href={project.github_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"
                        title="Open GitHub repository"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove project ${project.title}`}
                      onClick={() => handleDeleteProject(project.id, idx)}
                      className="size-8 text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>

                {project.technologies && project.technologies.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {project.technologies.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[11px] font-medium text-primary"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 3. Skills Section */}
      <Card className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Your Skills</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add one skill per row. Comma-separated names are saved separately with the same experience level.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={entries.length >= 30}
            onClick={() => setEntries([...entries, { name: '', level: 'beginner' }])}
          >
            <Plus className="mr-1 size-4" />
            Add skill
          </Button>
        </div>
        <input name="skills" type="hidden" value={JSON.stringify(entries)} />
        <div className="space-y-3">
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground italic">No skills added yet.</p>
          )}
          {entries.map((entry, i) => (
            <div key={i} className="flex gap-3">
              <Input
                aria-label={`Skill ${i + 1}`}
                placeholder="e.g. Python"
                required
                maxLength={80}
                value={entry.name}
                onChange={(e) =>
                  setEntries(entries.map((s, j) => (j === i ? { ...s, name: e.target.value } : s)))
                }
              />
              <select
                aria-label={`Skill ${i + 1} experience`}
                className="max-w-40 rounded-md border border-border px-3 text-sm bg-background text-foreground"
                value={entry.level}
                onChange={(e) =>
                  setEntries(
                    entries.map((s, j) =>
                      j === i ? { ...s, level: e.target.value as Skill['level'] } : s
                    )
                  )
                }
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove skill ${i + 1}`}
                onClick={() => setEntries(entries.filter((_, j) => j !== i))}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* 4. What you're looking for (P-01: Scholarship & Program removed from active choices) */}
      <Card className="p-6">
        <h2 className="mb-2 text-lg font-semibold text-foreground">What You&apos;re Looking For</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Select the active opportunity types you want your agent to discover and match.
        </p>

        {/* Active interest types: only internship, hackathon, job (P-01) */}
        <div className="mb-6 flex flex-wrap gap-3">
          {activeInterestTypes.map((t) => (
            <label
              key={t}
              className="flex items-center gap-2 rounded-full border border-border px-4 py-2 capitalize cursor-pointer transition-colors hover:border-primary/50 text-sm font-medium"
            >
              <input
                type="checkbox"
                name="interest_types"
                value={t}
                defaultChecked={profile?.interest_types?.includes(t) ?? false}
                className="rounded border-border text-primary focus:ring-primary"
              />
              {t}
            </label>
          ))}
        </div>

        {/* Historic / Retired interests warning (P-01) */}
        {userHistoricInterests.length > 0 && (
          <div className="mb-6 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-700 dark:text-amber-300">
            <span className="font-semibold uppercase tracking-wide">Historic Preferences:</span>
            <span className="ml-1">
              Your profile previously tracked {userHistoricInterests.join(', ')}. Scholarship and Program listings have been retired from active discovery; your historic selections remain preserved on file.
            </span>
          </div>
        )}

        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="preferred_locations" className="text-sm font-medium text-foreground">
              Preferred locations
            </label>
            <Input
              id="preferred_locations"
              name="preferred_locations"
              maxLength={1600}
              placeholder="e.g. Remote, Pune, Bengaluru"
              defaultValue={profile?.preferred_locations?.join(', ') || ''}
            />
            <p className="text-xs text-muted-foreground">Separate locations with commas.</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="career_goals" className="text-sm font-medium text-foreground">
              Career goals
            </label>
            <Textarea
              id="career_goals"
              name="career_goals"
              maxLength={2000}
              placeholder="What would you like to explore or work towards?"
              defaultValue={profile?.career_goals || ''}
            />
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <label htmlFor="autonomy_mode" className="text-sm font-medium text-foreground">
            Autonomy mode
          </label>
          <select
            id="autonomy_mode"
            name="autonomy_mode"
            defaultValue={profile?.autonomy_mode || 'balanced'}
            className="w-full max-w-xs rounded-md border border-border px-3 py-2 text-sm bg-background text-foreground"
          >
            <option value="cautious">Cautious</option>
            <option value="balanced">Balanced</option>
            <option value="autopilot">Autopilot</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Cautious: score &ge; 80 and confidence &ge; 85%. Balanced: &ge; 70 and &ge; 75%. Autopilot: &ge; 60 and &ge; 65%. Every mode asks when eligibility is unknown and filters ineligible or expired opportunities.
          </p>
        </div>
      </Card>

      {/* 5. Separate notification email consent and calendar consent toggles with revocation controls (P-05) */}
      <Card className="p-6 space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Notifications & Calendar Permissions</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            OpportunityOS requires explicit opt-in for external notifications and integrations. Both default to disabled.
          </p>
        </div>

        {consentMessage && (
          <div className="rounded-lg border border-primary/20 bg-primary/10 p-3 text-xs text-primary">
            {consentMessage}
          </div>
        )}

        <div className="space-y-5">
          {/* Email Notification Consent */}
          <div className="rounded-xl border border-border p-4 bg-muted/10 space-y-3">
            <div className="flex items-start justify-between">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="notifications_enabled"
                  checked={emailConsent}
                  onChange={(e) => {
                    setEmailConsent(e.target.checked);
                    setConsentMessage(null);
                  }}
                  className="mt-0.5 rounded border-border text-primary focus:ring-primary"
                />
                <div>
                  <div className="flex items-center gap-2 font-medium text-sm text-foreground">
                    <Mail className="size-4 text-primary" />
                    <span>OpportunityOS Email Notifications & Reminders</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        emailConsent
                          ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                          : 'bg-muted text-muted-foreground border border-border'
                      }`}
                    >
                      {emailConsent ? 'Consent Granted' : 'Disabled / Revoked'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Receive verified opportunity matches and urgent deadline reminders at your verified email address.
                  </p>
                </div>
              </label>

              {emailConsent && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRevokeEmail}
                  className="text-xs h-7 text-muted-foreground hover:text-red-500 hover:border-red-500/30"
                >
                  Revoke Consent
                </Button>
              )}
            </div>
          </div>

          {/* Google Calendar Sync Permission */}
          <div className="rounded-xl border border-border p-4 bg-muted/10 space-y-3">
            <div className="flex items-start justify-between">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="calendar_sync_enabled"
                  checked={calendarConsent}
                  onChange={(e) => {
                    setCalendarConsent(e.target.checked);
                    setConsentMessage(null);
                  }}
                  className="mt-0.5 rounded border-border text-primary focus:ring-primary"
                />
                <div>
                  <div className="flex items-center gap-2 font-medium text-sm text-foreground">
                    <Calendar className="size-4 text-primary" />
                    <span>Google Calendar Sync Permission</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        calendarConsent
                          ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                          : 'bg-muted text-muted-foreground border border-border'
                      }`}
                    >
                      {calendarConsent ? 'Permission Granted' : 'Disabled / Revoked'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Allow OpportunityOS to automatically create and update verified deadline events on your Google Calendar. When disabled or revoked, OpportunityOS provides direct calendar links and downloadable .ICS calendar files instead.
                  </p>
                </div>
              </label>

              {calendarConsent && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRevokeCalendar}
                  className="text-xs h-7 text-muted-foreground hover:text-red-500 hover:border-red-500/30"
                >
                  Revoke Sync
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* State Feedback */}
      {state.error && (
        <p role="alert" className="text-sm text-red-600 font-medium">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm text-primary font-medium">
          {state.success}
        </p>
      )}

      <Button disabled={pending} className="min-w-32">
        {pending ? 'Saving…' : 'Save my profile'}
      </Button>
    </form>
  );
}
