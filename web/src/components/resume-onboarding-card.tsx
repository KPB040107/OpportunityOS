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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  alreadyExists: boolean;
  evidence: { page: number; quote: string };
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
  const [fileName, setFileName] = useState<string>('');
  const [totalPages, setTotalPages] = useState<number>(1);

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

      // Map reconciled skills (strictly require student to set level)
      const mappedSkills: ExtractedSkill[] = (data.reconciled?.skills || []).map((s: RawSkillResponse) => ({
        name: s.name,
        level: s.alreadyExists
          ? (currentSkills.find((cs) => cs.name.toLowerCase() === s.name.toLowerCase())?.level || 'intermediate')
          : '', // Must be chosen by student
        alreadyExists: s.alreadyExists,
        evidence: s.evidence,
        selected: true,
      }));
      setSkills(mappedSkills);
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

      const res = await fetch('/api/resume/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft_id: draftId,
          selected_fields: selectedFieldsObj,
          skills_with_levels: confirmedSkills,
          expected_revision: expectedRevision,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || 'Confirmation failed.');
      }

      setSuccess(`Profile updated successfully! Revision #${data.data?.new_revision ?? expectedRevision + 1}. Unlocked matching questions are now being re-evaluated.`);
      setDraftId(null);
      setFields([]);
      setSkills([]);
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
    setError(null);
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
            Upload your text PDF resume. We extract your academic facts and detected skills with page quotes so you only have to review and confirm once.
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
                        {field.field.replace('_', ' ')}
                      </span>
                    </label>
                    {field.isNew ? (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        New Field
                      </span>
                    ) : field.hasConflict ? (
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
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

          {/* Skills Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Detected Skills ({skills.filter((s) => s.selected).length})
                </h3>
                <p className="text-xs text-muted-foreground">
                  Select your experience level for newly detected skills (required)
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {skills.map((skill, idx) => (
                <div
                  key={skill.name}
                  className={`flex flex-col justify-between rounded-lg border p-3 transition-colors ${
                    skill.selected ? 'border-border bg-card' : 'border-border/60 bg-muted/10 opacity-50'
                  }`}
                >
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
                      <span className="text-sm font-medium text-foreground">{skill.name}</span>
                    </label>
                    {skill.alreadyExists && (
                      <span className="text-[10px] text-muted-foreground">Existing</span>
                    )}
                  </div>

                  <div className="mt-2.5">
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
                  </div>
                </div>
              ))}
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
