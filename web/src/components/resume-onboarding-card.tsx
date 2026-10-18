'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Sparkles,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Plus,
  ExternalLink,
  Calendar,
  Mail,
  Check,
  FolderGit2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Profile, Skill } from '@/lib/types';

interface ResumeOnboardingCardProps {
  currentProfile: Profile | null;
  currentSkills: Skill[];
  onProfileUpdated?: () => void;
}

interface RawFieldResponse {
  field: string;
  proposedValue: string | number;
  existingValue: string | number | null;
  isNew: boolean;
  hasConflict: boolean;
  evidence: { page: number; quote: string };
}

interface RawSkillResponse {
  name: string;
  level: 'beginner' | 'intermediate' | 'advanced' | null;
  suggestedLevel: 'beginner' | 'intermediate' | 'advanced' | null;
  confidence: number | null;
  alreadyExists: boolean;
  evidence: { page: number; quote: string };
}

interface RawProjectResponse {
  title: string;
  description: string;
  technologies: string[];
  github_url: string | null;
  dates: string | null;
  alreadyExists: boolean;
  evidence: { page: number; quote: string };
  state: string;
}

interface ExtractedField {
  field: string;
  proposedValue: string | number;
  existingValue: string | number | null;
  isNew: boolean;
  hasConflict: boolean;
  evidence: { page: number; quote: string };
  selected: boolean;
  editedValue: string | number;
}

interface ExtractedSkill {
  name: string;
  level: 'beginner' | 'intermediate' | 'advanced' | '';
  suggestedLevel: 'beginner' | 'intermediate' | 'advanced' | null;
  confidence: number | null;
  alreadyExists: boolean;
  evidence: { page: number; quote: string };
  selected: boolean;
}

interface ExtractedProject {
  id: string;
  title: string;
  description: string;
  technologies: string[];
  github_url: string;
  dates: string;
  alreadyExists: boolean;
  evidence: { page: number; quote: string };
  selected: boolean;
}

export function ResumeOnboardingCard({
  currentProfile,
  currentSkills,
  onProfileUpdated,
}: ResumeOnboardingCardProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [draftId, setDraftId] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [expectedRevision, setExpectedRevision] = useState<number>(currentProfile?.revision ?? 0);
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [skills, setSkills] = useState<ExtractedSkill[]>([]);
  const [projects, setProjects] = useState<ExtractedProject[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [totalPages, setTotalPages] = useState<number>(1);

  // Consent toggles (default off per P-05)
  const [emailConsent, setEmailConsent] = useState(false);
  const [calendarConsent, setCalendarConsent] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(selectedFile: File) {
    if (!selectedFile) return;
    if (selectedFile.type !== 'application/pdf' && !selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are supported. Please upload a text-based PDF resume.');
      return;
    }
    if (selectedFile.size > 5 * 1024 * 1024) {
      setError('File size exceeds the 5 MiB limit.');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setSuccess(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/resume/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to process resume.');
      }

      setDraftId(data.draft_id);
      setUploadId(data.upload_id);
      setFileName(data.fileName || selectedFile.name);
      setTotalPages(data.totalPages || 1);
      setExpectedRevision(data.draft?.base_profile_revision ?? currentProfile?.revision ?? 0);

      // Map reconciled fields
      const mappedFields: ExtractedField[] = (data.reconciled?.fields || []).map((f: RawFieldResponse) => ({
        field: f.field,
        proposedValue: f.proposedValue,
        existingValue: f.existingValue,
        isNew: f.isNew,
        hasConflict: f.hasConflict,
        evidence: f.evidence,
        selected: true,
        editedValue: f.proposedValue,
      }));
      setFields(mappedFields);

      // Map reconciled skills with suggested level and evidence (P-04)
      const mappedSkills: ExtractedSkill[] = (data.reconciled?.skills || []).map((s: RawSkillResponse) => {
        const existingLevel = s.alreadyExists
          ? currentSkills.find((cs) => cs.name.toLowerCase() === s.name.toLowerCase())?.level
          : undefined;

        return {
          name: s.name,
          level: existingLevel || s.suggestedLevel || '',
          suggestedLevel: s.suggestedLevel || null,
          confidence: s.confidence || null,
          alreadyExists: s.alreadyExists,
          evidence: s.evidence,
          selected: true,
        };
      });
      setSkills(mappedSkills);

      // Map reconciled projects (P-02, P-03)
      const mappedProjects: ExtractedProject[] = (data.reconciled?.projects || []).map(
        (p: RawProjectResponse, idx: number) => ({
          id: `proj-${idx}-${Date.now()}`,
          title: p.title,
          description: p.description || '',
          technologies: Array.isArray(p.technologies) ? p.technologies : [],
          github_url: p.github_url || '',
          dates: p.dates || '',
          alreadyExists: p.alreadyExists,
          evidence: p.evidence,
          selected: true,
        })
      );
      setProjects(mappedProjects);

      // Reset consent toggles to false (default off per P-05)
      setEmailConsent(false);
      setCalendarConsent(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred while uploading.');
      setFile(null);
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirm() {
    if (!draftId) return;

    // Check if any selected skill is missing a level
    const unassignedSkill = skills.find((s) => s.selected && !s.alreadyExists && !s.level);
    if (unassignedSkill) {
      setError(`Please select an experience level (Beginner, Intermediate, or Advanced) for "${unassignedSkill.name}".`);
      return;
    }

    setConfirming(true);
    setError(null);

    try {
      const selectedFieldsObj: Record<string, string | number> = {};
      for (const f of fields) {
        if (f.selected) {
          selectedFieldsObj[f.field] = f.editedValue;
        }
      }

      const confirmedSkills = skills
        .filter((s) => s.selected && s.level)
        .map((s) => ({
          name: s.name,
          level: s.level,
        }));

      const confirmedProjects = projects
        .filter((p) => p.selected && p.title.trim())
        .map((p) => ({
          title: p.title.trim(),
          description: p.description.trim(),
          technologies: p.technologies,
          github_url: p.github_url.trim() || null,
          dates: p.dates.trim() || null,
          source: 'resume',
        }));

      const res = await fetch('/api/resume/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft_id: draftId,
          selected_fields: selectedFieldsObj,
          skills_with_levels: confirmedSkills,
          expected_revision: expectedRevision,
          projects: confirmedProjects,
          consents: {
            email_notifications_enabled: emailConsent,
            calendar_sync_enabled: calendarConsent,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Confirmation failed.');
      }

      setSuccess(`Profile updated successfully! Revision #${data.data?.new_revision ?? expectedRevision + 1}. Projects and consents recorded.`);
      setDraftId(null);
      setFields([]);
      setSkills([]);
      setProjects([]);
      setFile(null);

      if (onProfileUpdated) {
        onProfileUpdated();
      }
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to confirm profile draft.');
    } finally {
      setConfirming(false);
    }
  }

  async function handleDiscard() {
    if (uploadId) {
      try {
        await fetch(`/api/resume/upload/${uploadId}`, { method: 'DELETE' });
      } catch {
        // Best effort deletion
      }
    }
    setFile(null);
    setDraftId(null);
    setUploadId(null);
    setFields([]);
    setSkills([]);
    setProjects([]);
    setError(null);
  }

  function addEmptyProject() {
    setProjects([
      ...projects,
      {
        id: `proj-manual-${Date.now()}`,
        title: '',
        description: '',
        technologies: [],
        github_url: '',
        dates: '',
        alreadyExists: false,
        evidence: { page: 1, quote: 'Added manually during resume review' },
        selected: true,
      },
    ]);
  }

  return (
    <Card className="border-border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </span>
            <h2 className="text-xl font-semibold text-foreground">1-Minute Resume Onboarding</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload your text PDF resume. We extract your academic facts, projects, and suggested skill levels with evidence quotes for 1-click confirmation.
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-primary" />
          <span>D9 Privacy Retention</span>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 p-3 text-sm text-primary">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Upload State */}
      {!draftId && !uploading && (
        <div className="mt-6">
          <input
            type="file"
            ref={fileInputRef}
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileUpload(f);
            }}
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
          >
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Upload className="size-6" />
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">
              Click to select or drag and drop your Resume PDF
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Max 5 MiB &bull; Up to 10 pages &bull; Scanned PDFs & embedded scripts rejected
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span className="rounded-md border border-border bg-background px-2 py-0.5">Text-Based PDF</span>
              <span className="rounded-md border border-border bg-background px-2 py-0.5">Zero Contact Leaks</span>
              <span className="rounded-md border border-border bg-background px-2 py-0.5">Auto-Cleaned on Confirm</span>
            </div>
          </div>
        </div>
      )}

      {/* Uploading Animation */}
      {uploading && (
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-border bg-muted/20 p-8 text-center">
          <RefreshCw className="size-8 animate-spin text-primary" />
          <p className="mt-3 text-sm font-medium text-foreground">
            Analyzing {file?.name}...
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Validating PDF signature, extracting text layout, and compiling profile draft
          </p>
        </div>
      )}

      {/* Review & Reconcile State */}
      {draftId && (
        <div className="mt-6 space-y-6">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              <span className="text-sm font-medium text-foreground">{fileName}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {totalPages} {totalPages === 1 ? 'page' : 'pages'}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDiscard}
              className="text-xs text-muted-foreground hover:text-red-500"
            >
              <Trash2 className="mr-1 size-3.5" />
              Discard Draft
            </Button>
          </div>

          {/* Academic Facts Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Proposed Academic Details
              </h3>
              <span className="text-xs text-muted-foreground">Uncheck any values you don&apos;t want applied</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((field, idx) => (
                <div
                  key={field.field}
                  className={`rounded-lg border p-3.5 transition-colors ${
                    field.selected ? 'border-primary/40 bg-card' : 'border-border/60 bg-muted/10 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={field.selected}
                        onChange={(e) => {
                          const updated = [...fields];
                          updated[idx].selected = e.target.checked;
                          setFields(updated);
                        }}
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-xs font-semibold uppercase text-foreground">
                        {field.field.replace(/_/g, ' ')}
                      </span>
                    </label>
                    {field.isNew ? (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        New Field
                      </span>
                    ) : field.hasConflict ? (
                      <span className="rounded bg-ask border border-border px-1.5 py-0.5 text-[10px] font-medium text-ask-foreground">
                        Overwrites ({String(field.existingValue)})
                      </span>
                    ) : (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        Matches Profile
                      </span>
                    )}
                  </div>

                  <div className="mt-2">
                    <Input
                      value={field.editedValue}
                      disabled={!field.selected}
                      onChange={(e) => {
                        const updated = [...fields];
                        updated[idx].editedValue = e.target.value;
                        setFields(updated);
                      }}
                      className="h-8 text-sm"
                    />
                  </div>

                  {field.evidence?.quote && (
                    <div className="mt-2 flex items-start gap-1 text-[11px] text-muted-foreground">
                      <BookOpen className="size-3 shrink-0 mt-0.5 text-primary/70" />
                      <span className="italic">
                        &ldquo;{field.evidence.quote}&rdquo; (p. {field.evidence.page})
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Proposed Projects Section (P-02, P-03) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FolderGit2 className="size-4 text-primary" />
                  Proposed Projects ({projects.filter((p) => p.selected).length})
                </h3>
                <p className="text-xs text-muted-foreground">
                  Review, edit, or remove detected projects before applying to your profile
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addEmptyProject} className="text-xs h-7">
                <Plus className="mr-1 size-3.5" />
                Add Project
              </Button>
            </div>

            {projects.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No project sections detected in this resume. Click &ldquo;Add Project&rdquo; to add one.
              </div>
            ) : (
              <div className="space-y-3">
                {projects.map((project, idx) => (
                  <div
                    key={project.id}
                    className={`rounded-lg border p-4 transition-colors ${
                      project.selected ? 'border-primary/30 bg-card' : 'border-border/60 bg-muted/10 opacity-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={project.selected}
                          onChange={(e) => {
                            const updated = [...projects];
                            updated[idx].selected = e.target.checked;
                            setProjects(updated);
                          }}
                          className="rounded border-border text-primary focus:ring-primary"
                        />
                        <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                          Project #{idx + 1}
                        </span>
                      </label>
                      <div className="flex items-center gap-2">
                        {project.alreadyExists && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            Existing
                          </span>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setProjects(projects.filter((_, j) => j !== idx))}
                          className="h-6 px-1.5 text-muted-foreground hover:text-red-500"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-[11px] font-medium text-muted-foreground">Project Title</label>
                        <Input
                          placeholder="e.g. Distributed Task Queue"
                          value={project.title}
                          disabled={!project.selected}
                          onChange={(e) => {
                            const updated = [...projects];
                            updated[idx].title = e.target.value;
                            setProjects(updated);
                          }}
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
                          <span>GitHub URL</span>
                          {project.github_url && (
                            <a
                              href={project.github_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline flex items-center gap-0.5"
                            >
                              <span>open</span>
                              <ExternalLink className="size-2.5" />
                            </a>
                          )}
                        </label>
                        <Input
                          placeholder="https://github.com/username/repo"
                          value={project.github_url}
                          disabled={!project.selected}
                          onChange={(e) => {
                            const updated = [...projects];
                            updated[idx].github_url = e.target.value;
                            setProjects(updated);
                          }}
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="text-[11px] font-medium text-muted-foreground">Technologies (comma-separated)</label>
                      <Input
                        placeholder="e.g. React, TypeScript, PostgreSQL"
                        value={project.technologies.join(', ')}
                        disabled={!project.selected}
                        onChange={(e) => {
                          const updated = [...projects];
                          updated[idx].technologies = e.target.value
                            .split(',')
                            .map((t) => t.trim())
                            .filter(Boolean);
                          setProjects(updated);
                        }}
                        className="mt-1 h-8 text-sm"
                      />
                    </div>

                    <div className="mt-3">
                      <label className="text-[11px] font-medium text-muted-foreground">Description</label>
                      <Textarea
                        placeholder="Brief summary of architecture, scope, or accomplishments"
                        value={project.description}
                        disabled={!project.selected}
                        onChange={(e) => {
                          const updated = [...projects];
                          updated[idx].description = e.target.value;
                          setProjects(updated);
                        }}
                        className="mt-1 min-h-[60px] text-xs"
                      />
                    </div>

                    {project.evidence?.quote && (
                      <div className="mt-2 flex items-start gap-1 text-[11px] text-muted-foreground">
                        <BookOpen className="size-3 shrink-0 mt-0.5 text-primary/70" />
                        <span className="italic">
                          &ldquo;{project.evidence.quote}&rdquo; (p. {project.evidence.page})
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Detected Skills Section (P-04) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Detected Skills ({skills.filter((s) => s.selected).length})
                </h3>
                <p className="text-xs text-muted-foreground">
                  Suggested proficiency levels are pre-calculated with evidence. Accept, adjust, or remove levels.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {skills.map((skill, idx) => (
                <div
                  key={skill.name}
                  className={`flex flex-col justify-between rounded-lg border p-3.5 transition-colors ${
                    skill.selected ? 'border-border bg-card' : 'border-border/60 bg-muted/10 opacity-50'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={skill.selected}
                          onChange={(e) => {
                            const updated = [...skills];
                            updated[idx].selected = e.target.checked;
                            setSkills(updated);
                          }}
                          className="rounded border-border text-primary focus:ring-primary"
                        />
                        <span className="text-sm font-semibold text-foreground">{skill.name}</span>
                      </label>
                      {skill.alreadyExists && (
                        <span className="text-[10px] text-muted-foreground rounded bg-muted px-1.5 py-0.5">Existing</span>
                      )}
                    </div>

                    {/* Suggested level pill with confidence */}
                    {skill.suggestedLevel ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary capitalize">
                          Suggested: {skill.suggestedLevel} ({Math.round((skill.confidence ?? 0.8) * 100)}% conf)
                        </span>
                        {skill.level !== skill.suggestedLevel && skill.selected && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const updated = [...skills];
                              updated[idx].level = skill.suggestedLevel!;
                              setSkills(updated);
                            }}
                            className="h-5 px-1.5 text-[10px] text-primary hover:bg-primary/10"
                          >
                            <Check className="mr-0.5 size-2.5" />
                            Accept
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2">
                        <span className="text-[10px] text-muted-foreground italic">
                          Level unset &bull; please choose
                        </span>
                      </div>
                    )}

                    {/* Evidence quote */}
                    {skill.evidence?.quote && (
                      <div className="mt-2 flex items-start gap-1 text-[11px] text-muted-foreground">
                        <BookOpen className="size-3 shrink-0 mt-0.5 text-primary/70" />
                        <span className="italic line-clamp-2">
                          &ldquo;{skill.evidence.quote}&rdquo;
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <select
                      value={skill.level}
                      disabled={!skill.selected}
                      onChange={(e) => {
                        const updated = [...skills];
                        updated[idx].level = e.target.value as ExtractedSkill['level'];
                        setSkills(updated);
                      }}
                      className={`h-8 w-full rounded-md border text-xs px-2 bg-background ${
                        skill.selected && !skill.level
                          ? 'border-red-400 bg-red-50/10 text-red-500'
                          : 'border-border text-foreground'
                      }`}
                    >
                      <option value="" disabled>Select Level...</option>
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>

                    {skill.level && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const updated = [...skills];
                          updated[idx].level = '';
                          setSkills(updated);
                        }}
                        className="h-8 px-2 text-[10px] text-muted-foreground hover:text-red-500"
                        title="Clear level"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notification and Calendar Consents (P-05) */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Permissions & Consents
            </h3>
            <p className="text-xs text-muted-foreground">
              OpportunityOS respects your privacy. Both integrations default to disabled and can be revoked anytime in Profile settings.
            </p>

            <div className="space-y-3 pt-1">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailConsent}
                  onChange={(e) => setEmailConsent(e.target.checked)}
                  className="mt-0.5 rounded border-border text-primary focus:ring-primary"
                />
                <div className="text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <Mail className="size-3.5 text-primary" />
                    <span>OpportunityOS Email Notifications & Reminders</span>
                    <span className="text-[10px] text-muted-foreground font-normal">(Default off)</span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">
                    Receive verified opportunity alerts and approaching deadline reminders at your email address.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={calendarConsent}
                  onChange={(e) => setCalendarConsent(e.target.checked)}
                  className="mt-0.5 rounded border-border text-primary focus:ring-primary"
                />
                <div className="text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <Calendar className="size-3.5 text-primary" />
                    <span>Demo Calendar Sync Opt-in</span>
                    <span className="text-[10px] text-muted-foreground font-normal">(Default off)</span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">
                    Direct event creation currently works only for the connected demo account. Other accounts receive calendar links and downloadable .ICS files for verified deadlines, even when this opt-in is on.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={handleDiscard} disabled={confirming}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={confirming}>
              {confirming ? (
                <>
                  <RefreshCw className="mr-2 size-4 animate-spin" />
                  Updating Profile...
                </>
              ) : (
                <>
                  Confirm & Update Profile
                  <ArrowRight className="ml-2 size-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
