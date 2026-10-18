'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  RefreshCw,
  Trash2
} from 'lucide-react';
import type { Profile, Skill } from '@/lib/types';

interface ProfileOnboardingViewProps {
  currentProfile: Profile | null;
  currentSkills?: Skill[];
}

export function ProfileOnboardingView({
  currentProfile
}: ProfileOnboardingViewProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isParsing, setIsParsing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftId, setDraftId] = useState<string | null>(null);
  const [expectedRevision, setExpectedRevision] = useState<number>(currentProfile?.revision ?? 0);
  const [fileName, setFileName] = useState<string | null>(null);

  // Extracted data state
  const [displayName, setDisplayName] = useState(currentProfile?.display_name || '');
  const [degree, setDegree] = useState(currentProfile?.degree || '');
  const [branch, setBranch] = useState(currentProfile?.branch || '');
  const [gradYear, setGradYear] = useState<number | ''>(currentProfile?.graduation_year || '');
  const [cgpa, setCgpa] = useState<number | ''>(currentProfile?.cgpa || '');
  const [skills, setSkills] = useState<Array<{ name: string; level: 'beginner' | 'intermediate' | 'advanced' }>>([]);
  const [projects, setProjects] = useState<Array<{
    title: string;
    description: string;
    technologies: string[];
    github_url: string | null;
  }>>([]);

  const isParsed = !!draftId;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please choose a valid PDF file. Trajectory extracts facts from PDF resumes.');
      return;
    }

    setError(null);
    setIsParsing(true);
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/resume/upload', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to parse resume.');
      }

      setDraftId(data.draft_id);
      setExpectedRevision(data.current_revision ?? (currentProfile?.revision ?? 0));

      // Populate draft fields
      const fields = data.draft?.fields || data.extracted_fields || [];
      for (const f of fields) {
        const val = f.value ?? f.proposedValue;
        if (f.field === 'display_name' && val) setDisplayName(String(val));
        if (f.field === 'degree' && val) setDegree(String(val));
        if (f.field === 'branch' && val) setBranch(String(val));
        if (f.field === 'graduation_year' && val) setGradYear(Number(val));
        if (f.field === 'cgpa' && val) setCgpa(Number(val));
      }

      // Populate skills
      interface RawSkill {
        name?: string;
        skill?: string;
        suggestedLevel?: 'beginner' | 'intermediate' | 'advanced';
        level?: 'beginner' | 'intermediate' | 'advanced';
      }
      const rawSkills: Array<RawSkill | string> = data.draft?.skills || data.extracted_skills || [];
      const extractedSkills = rawSkills.map((s) => ({
        name: typeof s === 'string' ? s : (s.skill || s.name || ''),
        level: (typeof s !== 'string' ? s.suggestedLevel || s.level : null) || 'intermediate'
      }));
      setSkills(extractedSkills);

      // Populate projects
      interface RawProject {
        title?: string;
        description?: string;
        technologies?: string[];
        github_url?: string | null;
      }
      const rawProjects: RawProject[] = data.draft?.projects || data.extracted_projects || [];
      const extractedProjects = rawProjects.map((p) => ({
        title: p.title || 'Untitled Project',
        description: p.description || '',
        technologies: p.technologies || [],
        github_url: p.github_url || null
      }));
      setProjects(extractedProjects);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error uploading resume.';
      setError(msg);
      setDraftId(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirm = async () => {
    if (!draftId) {
      router.push('/onboarding/alerts');
      return;
    }

    setIsConfirming(true);
    setError(null);

    try {
      const selectedFields: Record<string, string | number> = {};
      if (displayName) selectedFields.display_name = displayName;
      if (degree) selectedFields.degree = degree;
      if (branch) selectedFields.branch = branch;
      if (gradYear) selectedFields.graduation_year = Number(gradYear);
      if (cgpa) selectedFields.cgpa = Number(cgpa);

      const payload = {
        draft_id: draftId,
        expected_revision: expectedRevision,
        selected_fields: selectedFields,
        skills_with_levels: skills,
        projects: projects.map((p) => ({
          title: p.title,
          description: p.description,
          technologies: p.technologies,
          github_url: p.github_url
        }))
      };

      const res = await fetch('/api/resume/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Confirmation failed.');
      }

      // Successfully saved profile and purged PDF -> move to Step 2: Alerts
      router.push('/onboarding/alerts');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error confirming profile.';
      setError(msg);
      setIsConfirming(false);
    }
  };

  return (
    <div className="min-h-screen box-border pb-16 font-sans text-foreground bg-background">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-line bg-background">
        <Link href="#top" className="flex items-center gap-2.5 text-foreground no-underline group">
          <span
            aria-hidden="true"
            className="size-5 rounded-[5px] border-[1.5px] border-border bg-primary shadow-[2px_2px_0_#111111]"
          />
          <span className="font-display font-extrabold text-xl tracking-tight text-foreground">
            Trajectory
          </span>
        </Link>
        <ol className="list-none m-0 p-0 flex items-center gap-2 font-mono text-xs tracking-wider">
          <li className="flex items-center gap-2 px-2.5 py-1.5 border-[1.5px] border-border rounded-[8px] bg-white text-foreground font-bold shadow-hard-sm">
            1 PROFILE
          </li>
          <li aria-hidden="true" className="w-6 h-[1.5px] bg-border" />
          <li className="flex items-center gap-2 px-2.5 py-1.5 border-[1.5px] border-line rounded-[8px] text-muted-foreground">
            2 ALERTS
          </li>
        </ol>
      </header>

      {/* Main Container */}
      <main className="max-w-[1160px] mx-auto px-6 pt-12 flex flex-col gap-8">
        <div className="flex flex-col gap-3 max-w-[720px]">
          <span className="font-mono text-xs tracking-[0.12em] text-accent-text font-semibold uppercase">
            Step 1 of 2 · About two minutes
          </span>
          <h1 className="font-display font-extrabold text-4xl sm:text-6xl tracking-tight leading-[0.98] text-foreground m-0">
            Drop your resume.
            <br />
            We&apos;ll fill in the rest.
          </h1>
          <p className="text-base sm:text-lg text-ink-2 leading-relaxed m-0">
            Every detail we pull out is tagged with where it came from, so you can check it in seconds. The PDF file is permanently purged once you confirm.
          </p>
        </div>

        {error && (
          <div className="p-4 border-[1.5px] border-red-900 rounded-[12px] bg-danger text-danger-foreground text-sm font-medium">
            {error}
          </div>
        )}

        {/* State A: Idle (No resume uploaded yet) */}
        {!isParsed && !isParsing && (
          <div className="flex flex-col items-center justify-center gap-4 min-h-[340px] p-10 border-2 border-dashed border-border rounded-[16px] bg-white text-center shadow-hard">
            <span
              aria-hidden="true"
              className="w-16 h-20 box-border border-[1.5px] border-border rounded-[8px] bg-act shadow-[4px_4px_0_#111111] flex items-end justify-center pb-2.5 font-mono text-xs font-semibold"
            >
              PDF
            </span>
            <div className="flex flex-col gap-1">
              <p className="font-display font-bold text-2xl text-foreground m-0">
                Drag your resume here
              </p>
              <p className="text-sm text-muted-foreground m-0 font-mono">
                PDF only · 100% private to you · Purged on confirmation
              </p>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept="application/pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="h-12 px-6 border-[1.5px] border-border rounded-[12px] bg-primary shadow-hard text-primary-foreground font-sans text-sm font-bold transition-all hover:scale-[1.02] active:translate-x-0.5 active:translate-y-0.5"
            >
              Choose a PDF
            </button>
            <Link
              href="/onboarding/alerts"
              className="inline-flex items-center min-h-[44px] text-xs font-mono text-muted-foreground hover:text-foreground underline underline-offset-4"
            >
              No resume? Fill it in by hand →
            </Link>
          </div>
        )}

        {/* State B: Parsing in progress */}
        {isParsing && (
          <div className="min-h-[380px] p-8 border-[1.5px] border-border rounded-[16px] bg-white shadow-hard flex flex-col items-center justify-center gap-4 text-center">
            <RefreshCw className="size-10 text-primary animate-spin" />
            <h2 className="font-display font-bold text-2xl sm:text-3xl text-foreground m-0">
              Reading your resume…
            </h2>
            <p className="font-mono text-xs tracking-wider text-muted-foreground animate-pulse m-0">
              EDUCATION · SKILLS · PROJECTS · PROVENANCE TAGS
            </p>
            <p className="text-xs text-ink-2 max-w-sm">
              Analyzing file: <span className="font-mono font-semibold">{fileName}</span>
            </p>
          </div>
        )}

        {/* State C: Parsed Draft Review */}
        {isParsed && !isParsing && (
          <div className="flex flex-col gap-6">
            <div className="p-4 border-[1.5px] border-border rounded-[12px] bg-act text-act-foreground flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-act-foreground shrink-0" />
                <span className="text-sm font-medium">
                  Resume extracted successfully. Review and confirm your profile facts below.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDraftId(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="text-xs font-mono font-semibold text-act-foreground underline hover:text-foreground"
              >
                Upload different PDF
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column: Academic & Core Facts */}
              <div className="flex flex-col gap-4 p-6 border-[1.5px] border-border rounded-[14px] bg-white shadow-hard">
                <div className="flex items-center gap-2 border-b border-line pb-3">
                  <span className="size-6 rounded-[6px] border-[1.5px] border-border bg-primary flex items-center justify-center font-mono text-xs font-bold text-primary-foreground">
                    1
                  </span>
                  <h3 className="font-display font-bold text-lg text-foreground m-0">
                    Academic Background
                  </h3>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-mono uppercase text-muted-foreground font-semibold">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Alex Kumar"
                      className="w-full h-10 mt-1 px-3 border-[1.5px] border-border rounded-[8px] bg-background text-sm font-semibold"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-mono uppercase text-muted-foreground font-semibold">
                        Degree
                      </label>
                      <input
                        type="text"
                        value={degree}
                        onChange={(e) => setDegree(e.target.value)}
                        placeholder="e.g. B.Tech"
                        className="w-full h-10 mt-1 px-3 border-[1.5px] border-border rounded-[8px] bg-background text-sm font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-mono uppercase text-muted-foreground font-semibold">
                        Branch / Major
                      </label>
                      <input
                        type="text"
                        value={branch}
                        onChange={(e) => setBranch(e.target.value)}
                        placeholder="e.g. Computer Science"
                        className="w-full h-10 mt-1 px-3 border-[1.5px] border-border rounded-[8px] bg-background text-sm font-semibold"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-mono uppercase text-muted-foreground font-semibold">
                        Graduation Year
                      </label>
                      <input
                        type="number"
                        value={gradYear}
                        onChange={(e) => setGradYear(Number(e.target.value) || '')}
                        placeholder="2027"
                        className="w-full h-10 mt-1 px-3 border-[1.5px] border-border rounded-[8px] bg-background text-sm font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-mono uppercase text-muted-foreground font-semibold">
                        CGPA (Scale of 10)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={cgpa}
                        onChange={(e) => setCgpa(Number(e.target.value) || '')}
                        placeholder="8.5"
                        className="w-full h-10 mt-1 px-3 border-[1.5px] border-border rounded-[8px] bg-background text-sm font-semibold"
                      />
                    </div>
                  </div>
                </div>

                {/* Skills Section */}
                <div className="flex items-center gap-2 border-b border-line pb-3 pt-3">
                  <span className="size-6 rounded-[6px] border-[1.5px] border-border bg-primary flex items-center justify-center font-mono text-xs font-bold text-primary-foreground">
                    2
                  </span>
                  <h3 className="font-display font-bold text-lg text-foreground m-0">
                    Confirmed Skills ({skills.length})
                  </h3>
                </div>

                <div className="flex flex-wrap gap-2">
                  {skills.map((skill, idx) => (
                    <span
                      key={skill.name}
                      className="inline-flex items-center gap-1.5 px-3 py-1 border-[1.5px] border-border rounded-full bg-act text-foreground text-xs font-medium"
                    >
                      <span className="font-semibold">{skill.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">· {skill.level}</span>
                      <button
                        type="button"
                        onClick={() => setSkills(skills.filter((_, i) => i !== idx))}
                        className="ml-1 text-muted-foreground hover:text-danger-foreground font-bold"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Right Column: Extracted Projects */}
              <div className="flex flex-col gap-4 p-6 border-[1.5px] border-border rounded-[14px] bg-white shadow-hard">
                <div className="flex items-center gap-2 border-b border-line pb-3">
                  <span className="size-6 rounded-[6px] border-[1.5px] border-border bg-primary flex items-center justify-center font-mono text-xs font-bold text-primary-foreground">
                    3
                  </span>
                  <h3 className="font-display font-bold text-lg text-foreground m-0">
                    Extracted Projects ({projects.length})
                  </h3>
                </div>

                <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                  {projects.map((proj, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 border-[1.5px] border-border rounded-[10px] bg-[#F3F1EC] flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display font-bold text-sm text-foreground">
                          {proj.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => setProjects(projects.filter((_, i) => i !== idx))}
                          className="text-xs text-muted-foreground hover:text-danger-foreground"
                          title="Remove project"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-ink-2 line-clamp-2 m-0">
                        {proj.description}
                      </p>
                      {proj.technologies?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {proj.technologies.map((t) => (
                            <span
                              key={t}
                              className="px-1.5 py-0.5 rounded-[4px] border border-border bg-white font-mono text-[10px]"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-[1.5px] border-border rounded-[14px] bg-white shadow-hard">
              <span className="text-xs font-mono text-muted-foreground">
                Privacy D9: The PDF is deleted immediately when you click Confirm.
              </span>
              <div className="flex items-center gap-3">
                <Link
                  href="/onboarding/alerts"
                  className="px-4 py-2 text-xs font-mono font-medium text-muted-foreground hover:text-foreground"
                >
                  Skip for now →
                </Link>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isConfirming}
                  className="flex items-center gap-2 h-12 px-6 border-[1.5px] border-border rounded-[12px] bg-primary shadow-hard text-primary-foreground font-sans font-bold text-sm transition-all hover:scale-[1.01] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50"
                >
                  {isConfirming ? 'Saving profile & purging PDF…' : 'Confirm & Continue to Alerts →'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
