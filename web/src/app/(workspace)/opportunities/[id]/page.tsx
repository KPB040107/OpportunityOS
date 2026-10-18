import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Layers,
  Target,
  BookOpen,
  ChevronDown,
  FileText
} from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { ActionStatus } from '@/components/action-status';
import {
  opportunityFields,
  deadlineLabel,
  trustBadgeDetails,
  extractCompensationDetails,
  type Opportunity,
  type Requirement,
  type Evidence
} from '@/lib/analysis';
import { Card } from '@/components/ui/card';
import { LiveUpdates } from '@/components/live-updates';
import { formatDate } from '@/lib/utils';
import { matchFields, type Match, type EligibilityCheck } from '@/lib/decisions';
import { DecisionPanel } from '@/components/decision-panel';
import { DecisionToolbar } from '../decision-toolbar';

type Source = {
  raw_item_id: string;
  extracted_json: {
    evidence: Evidence[];
    requirements?: { kind: string; value: string; mandatory: boolean; evidence: string; requirement_class?: string }[];
  };
};

function generateRoleSummary(
  title: string | null,
  org: string | null,
  type: string,
  description: string | null,
  skills: string[]
): string {
  if (!description) {
    return `In this ${type || 'role'} at ${org || 'the organization'}, you will contribute to key initiatives and apply ${skills.length ? skills.slice(0, 3).join(', ') : 'technical skills'}.`;
  }
  const clean = description.replace(/^###?\s+.*$/gm, '').trim();
  const lines = clean.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 25);
  const respLines = lines.filter(l =>
    /\b(?:build|design|develop|implement|collaborate|work with|maintain|create|participate|solve|contribute|deliver|engineer)\b/i.test(l)
  );
  if (respLines.length > 0) {
    return respLines.slice(0, 3).join(' ');
  }
  return (
    lines.slice(0, 2).join(' ') ||
    `As a ${title || 'contributor'} at ${org || 'the organization'}, you will collaborate on core deliverables and apply engineering best practices.`
  );
}

function extractFallbackRequirements(description: string | null): Requirement[] {
  if (!description || description.trim().length < 30) return [];
  const lines = description.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const reqs: Requirement[] = [];
  let inQualSection = false;
  let isPreferredSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^(?:###?\s*)?(?:qualifications|requirements|who you are|what we(?:'re| are) looking for|skills required|basic qualifications|eligibility criteria|candidate profile)[\s:]*$/i.test(line)) {
      inQualSection = true;
      isPreferredSection = false;
      continue;
    }
    if (/^(?:###?\s*)?(?:preferred qualifications|bonus skills|nice to have|good to have|preferred)[\s:]*$/i.test(line)) {
      inQualSection = true;
      isPreferredSection = true;
      continue;
    }
    if (/^(?:###?\s*)?(?:about us|company description|role description|what you(?:'ll| will) do|responsibilities|benefits|compensation|how to apply)[\s:]*$/i.test(line)) {
      inQualSection = false;
      isPreferredSection = false;
      continue;
    }

    const isBullet = /^[•\-\*\u2022\u2023\u25E6\u2043\u2219]\s+/.test(line) || /^\d+\.\s+/.test(line);
    const cleanLine = line.replace(/^[•\-\*\u2022\u2023\u25E6\u2043\u2219\d\.\s]+/, '').trim();

    if ((inQualSection && isBullet) || (!inQualSection && isBullet && /\b(?:degree|bachelor|master|b\.?tech|computer science|experience|proficien|knowledge|familiar|skills?)\b/i.test(cleanLine))) {
      if (cleanLine.length < 10) continue;

      let kind: Requirement['kind'] = 'other';
      if (/\b(?:degree|bachelor|master|b\.?tech|b\.?e\.?|diploma)\b/i.test(cleanLine)) kind = 'degree';
      else if (/\b(?:computer science|information technology|engineering|branch|major)\b/i.test(cleanLine)) kind = 'branch';
      else if (/\b(?:cgpa|gpa|marks|percentage)\b/i.test(cleanLine)) kind = 'cgpa';
      else if (/\b(?:graduation|batch of|passout|academic year)\b/i.test(cleanLine)) kind = 'graduation_year';
      else if (/\b(?:react|javascript|python|java|c\+\+|node|sql|git|html|css|aws|docker)\b/i.test(cleanLine)) kind = 'skill';

      const isMandatory = !isPreferredSection && !/\b(?:preferred|bonus|plus|good to have|beneficial|advantage|optional)\b/i.test(cleanLine);
      const reqClass: Requirement['requirement_class'] = isPreferredSection || !isMandatory
        ? 'preferred_skill'
        : (['degree', 'branch', 'cgpa', 'graduation_year'].includes(kind) ? 'mandatory_eligibility' : 'required_skill');

      reqs.push({
        id: `fallback-${i}`,
        kind,
        value: cleanLine,
        mandatory: isMandatory,
        evidence_snippet: line,
        normalized_value: null,
        requirement_class: reqClass,
        quote: cleanLine
      });
    }
  }

  return reqs;
}

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, user } = await requireUser();

  const [oppRes, reqsRes, sourcesRes, evalRes, decisionRes, profileRes, profileSkillsRes] = await Promise.all([
    supabase.from('opportunities').select(opportunityFields).eq('id', id).eq('user_id', user.id).maybeSingle(),
    supabase.from('opportunity_requirements').select('id,kind,value,mandatory,evidence_snippet,normalized_value,requirement_class,quote').eq('opportunity_id', id).eq('user_id', user.id),
    supabase.from('opportunity_sources').select('raw_item_id,extracted_json').eq('opportunity_id', id).eq('user_id', user.id).order('first_seen_at', { ascending: true }).limit(50),
    supabase.from('matches').select(matchFields).eq('opportunity_id', id).eq('user_id', user.id).maybeSingle(),
    supabase.from('student_decisions').select('choice,created_at').eq('opportunity_id', id).eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('profiles').select('display_name,branch,academic_year,cgpa,degree').eq('user_id', user.id).maybeSingle(),
    supabase.from('profile_skills').select('skill_id,level,skills(canonical_name)').eq('user_id', user.id)
  ]);

  if (oppRes.error) throw new Error('Opportunity unavailable');
  if (!oppRes.data) notFound();
  const opportunity = oppRes.data as unknown as Opportunity;

  if (reqsRes.error || sourcesRes.error) throw new Error('Source evidence unavailable');
  const rawRequirements = (reqsRes.data || []) as Requirement[];
  const match = (evalRes.data || undefined) as unknown as Match | undefined;
  const provenance = (sourcesRes.data || []) as Source[];

  const submissions = provenance.length
    ? await supabase
        .from('raw_items')
        .select('id,source_type,raw_content,cleaned_text,final_url,fetched_at,created_at')
        .eq('user_id', user.id)
        .in('id', provenance.map(s => s.raw_item_id))
    : { data: [], error: null };
  if (submissions.error) throw new Error('Original submissions unavailable');

  const studentProfile = profileRes.data;

  // Student skill mapping for skill-gap calculation
  const studentSkillSet = new Set<string>();
  for (const ps of (profileSkillsRes.data || [])) {
    const canonical = (ps.skills as { canonical_name?: string } | null)?.canonical_name;
    if (canonical) studentSkillSet.add(canonical.toLowerCase());
  }

  // Merge requirements from DB and extracted_json
  const extractedJsonReqs = provenance[0]?.extracted_json?.requirements || [];
  const mergedReqs: Requirement[] = [...rawRequirements];

  // Fill in any requirement_class metadata from extracted_json if available
  for (const r of mergedReqs) {
    const matchExt = extractedJsonReqs.find(e => e.value.toLowerCase() === r.value.toLowerCase());
    if (matchExt?.requirement_class) {
      r.requirement_class = matchExt.requirement_class as Requirement['requirement_class'];
    }
  }

  // Also include skills from extracted_json.requirements if not already in DB requirements
  for (const er of extractedJsonReqs) {
    if (!mergedReqs.some(m => m.value.toLowerCase() === er.value.toLowerCase())) {
      mergedReqs.push({
        id: `ext-${er.value}`,
        kind: er.kind,
        value: er.value,
        mandatory: er.mandatory,
        evidence_snippet: er.evidence,
        normalized_value: null,
        requirement_class: er.requirement_class as Requirement['requirement_class']
      });
    }
  }

  // Resilient fallback: If no requirements were extracted from DB/provenance, parse qualifications from description
  if (mergedReqs.length === 0 && opportunity.description) {
    const fallbackReqs = extractFallbackRequirements(opportunity.description);
    mergedReqs.push(...fallbackReqs);
  }

  const statedSkills = (opportunity.skills && opportunity.skills.length > 0)
    ? opportunity.skills
    : mergedReqs.filter(r => r.kind === 'skill').map(r => r.value.split(/\s+/)[0]).filter(Boolean);
  const matchedSkills = statedSkills.filter(s => studentSkillSet.has(s.toLowerCase()));
  const missingSkills = statedSkills.filter(s => !studentSkillSet.has(s.toLowerCase()));
  const totalStatedSkills = statedSkills.length;
  const skillCoveragePct = totalStatedSkills > 0 ? Math.round((matchedSkills.length / totalStatedSkills) * 100) : 100;

  // Requirement Categorization (X-02)
  const requiredSkillsReqs = mergedReqs.filter(
    r => r.requirement_class === 'required_skill' || (r.kind === 'skill' && r.mandatory)
  );
  const preferredSkillsReqs = mergedReqs.filter(
    r => r.requirement_class === 'preferred_skill' || (r.kind === 'skill' && !r.mandatory)
  );
  const mandatoryEligibilityReqs = mergedReqs.filter(
    r =>
      r.requirement_class === 'mandatory_eligibility' ||
      (['degree', 'cgpa', 'academic_year', 'branch', 'submission_window', 'deadline'].includes(r.kind) && r.mandatory)
  );
  const otherReqs = mergedReqs.filter(
    r =>
      !requiredSkillsReqs.includes(r) &&
      !preferredSkillsReqs.includes(r) &&
      !mandatoryEligibilityReqs.includes(r)
  );

  const trustBadge = trustBadgeDetails(opportunity.trust_tier, opportunity.source_badge);
  const extJson = (provenance[0]?.extracted_json as Record<string, unknown>) || {};
  const extFields = (extJson.fields as Record<string, unknown>) || extJson;
  const oppRecord = opportunity as unknown as Record<string, unknown>;
  const oppFields = oppRecord.fields as Record<string, unknown> | undefined;
  const deadlineDisplay =
    (typeof extFields.deadline_display === 'string' ? extFields.deadline_display : undefined) ||
    (typeof extJson.deadline_display === 'string' ? extJson.deadline_display : undefined) ||
    (typeof oppRecord.deadline_display === 'string' ? oppRecord.deadline_display : undefined) ||
    (typeof oppFields?.deadline_display === 'string' ? oppFields.deadline_display : undefined);
  const deadlineTime =
    (typeof extFields.deadline_time === 'string' ? extFields.deadline_time : undefined) ||
    (typeof extJson.deadline_time === 'string' ? extJson.deadline_time : undefined) ||
    (typeof oppRecord.deadline_time === 'string' ? oppRecord.deadline_time : undefined) ||
    (typeof oppFields?.deadline_time === 'string' ? oppFields.deadline_time : undefined);

  const formattedDeadline = deadlineDisplay || (() => {
    const base = deadlineLabel(opportunity.deadline);
    if (deadlineTime && base !== 'Deadline passed' && base !== 'No deadline stated' && base !== 'Rolling / closing soon') {
      return `${base} (${deadlineTime})`;
    }
    return base;
  })();

  const roleSummary = generateRoleSummary(
    opportunity.title,
    opportunity.organization,
    opportunity.type,
    opportunity.description,
    opportunity.skills
  );

  const comp = extractCompensationDetails(opportunity);

  return (
    <>
      <LiveUpdates userId={user.id} />
      <Link href="/opportunities" className="mb-6 inline-flex items-center gap-2 text-sm text-primary hover:underline">
        <ArrowLeft className="size-4" />
        Back to opportunities
      </Link>

      {/* Top Header */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-primary">
          {opportunity.type === 'unknown' ? 'Opportunity' : opportunity.type} · Details ready
        </span>
        {opportunity.trust_tier && (
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${trustBadge.className}`}>
            <ShieldCheck className="mr-1 size-3" />
            {trustBadge.label}
          </span>
        )}
        {opportunity.requirements_status && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
            {opportunity.requirements_status === 'REQUIREMENTS_PRESENT' ? 'Requirements Grounded' : 'No Explicit Reqs'}
          </span>
        )}
      </div>

      <h1 className="mt-3 text-3xl font-semibold leading-tight">{opportunity.title || 'Title not stated'}</h1>
      <p className="mt-1 text-base text-muted-foreground">{opportunity.organization || 'Organisation unknown'}</p>

      {/* Risk Signals Alert */}
      {opportunity.risk_signals && opportunity.risk_signals.length > 0 && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
          <p className="font-semibold text-sm flex items-center gap-1.5">
            <AlertTriangle className="size-4 text-red-600" />
            Security Alert: Risk signals detected in source
          </p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            {opportunity.risk_signals.map((sig, i) => (
              <li key={i}>{sig}</li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-red-700">Automatic actions are strictly blocked pending explicit manual review.</p>
        </div>
      )}

      {/* Core Meta & Concise Generated Summary ("What you would do") */}
      <Card className="mt-6 p-6">
        <dl className="grid gap-6 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deadline</dt>
            <dd className="mt-1 text-sm font-semibold text-foreground">{formattedDeadline}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Location</dt>
            <dd className="mt-1 text-sm font-semibold text-foreground">{opportunity.location || 'Not stated'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{comp.label}</dt>
            <dd className="mt-1 text-sm font-semibold text-foreground flex items-center gap-2">
              <span>{comp.value}</span>
              {comp.paidStatus && comp.paidStatus !== 'Not disclosed' && (
                <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  comp.paidStatus === 'Paid' ? 'bg-act text-act-foreground border border-border' : 'bg-ask text-ask-foreground border border-border'
                }`}>
                  {comp.paidStatus}
                </span>
              )}
            </dd>
          </div>
        </dl>

        {/* What You Would Do Summary */}
        <div className="mt-6 pt-5 border-t border-border">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Sparkles className="size-4 text-primary" />
            What you would do
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground bg-muted/30 p-3.5 rounded-lg border border-border/60">
            {roleSummary}
          </p>
        </div>

        {opportunity.description && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              View full posted description
            </summary>
            <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground bg-slate-50 p-3 rounded-lg border border-border">
              {opportunity.description}
            </p>
          </details>
        )}

        {opportunity.application_url ? (
          <div className="mt-5 pt-4 border-t border-border">
            <a
              className="inline-flex items-center gap-1.5 font-semibold text-sm text-primary hover:underline"
              href={opportunity.application_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open application page
              <ArrowUpRight className="size-4" />
            </a>
          </div>
        ) : (
          <p className="mt-5 text-xs text-muted-foreground">Application link not stated in source.</p>
        )}
      </Card>

      {/* Action Decision Toolbar and Panel */}
      <DecisionToolbar
        opportunityId={id}
        canApprove={match?.status === 'complete' && match.eligibility_status === 'ELIGIBLE'}
        initialDecision={decisionRes.data}
      />
      <DecisionPanel match={match} id={id} />
      <ActionStatus matchId={match?.id} opportunityId={id} />

      {/* Known Eligibility Checks with Plain Language Reasons (X-02) */}
      <Card className="mt-6 p-6">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Target className="size-5 text-primary" />
          Eligibility Evaluation Breakdown
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Grounded checks comparing your profile facts against the stated criteria in this listing.
        </p>

        {match?.eligibility_checks && match.eligibility_checks.length > 0 ? (
          <div className="mt-4 space-y-3">
            {match.eligibility_checks.map((check: EligibilityCheck, idx: number) => {
              const isPass = check.status === 'PASS';
              const isFail = check.status === 'FAIL';
              return (
                <div
                  key={idx}
                  className={`p-3.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                    isPass
                      ? 'bg-act/30 border-border'
                      : isFail
                      ? 'bg-danger/30 border-border'
                      : 'bg-ask/30 border-border'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold uppercase tracking-wider text-[11px] text-muted-foreground">
                        {check.kind.replaceAll('_', ' ')}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          isPass
                            ? 'bg-act text-act-foreground border border-border'
                            : isFail
                            ? 'bg-danger text-danger-foreground border border-border'
                            : 'bg-ask text-ask-foreground border border-border'
                        }`}
                      >
                        {isPass ? (
                          <>
                            <CheckCircle2 className="size-3" /> PASS
                          </>
                        ) : isFail ? (
                          <>
                            <XCircle className="size-3" /> INELIGIBLE
                          </>
                        ) : (
                          <>
                            <HelpCircle className="size-3" /> {check.status || 'UNKNOWN'}
                          </>
                        )}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-foreground">{check.reason}</p>
                    {check.evidence && (
                      <p className="mt-1 text-xs text-muted-foreground italic">
                        Evidence: “{check.evidence}”
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {match ? 'Eligibility checks awaiting detailed run.' : 'No automated evaluation completed yet.'}
          </p>
        )}
      </Card>

      {/* Matched Skills vs Missing Skills (Skill Gap) (X-02) */}
      <Card className="mt-6 p-6">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Layers className="size-5 text-primary" />
          Skill Match & Gap Analysis
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Compare skills stated by the opportunity with confirmed skills in your profile.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {/* Matched Skills */}
          <div className="rounded-xl border border-border bg-act/20 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-act-foreground flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-act-foreground" />
              Matched Skills ({matchedSkills.length})
            </h3>
            {matchedSkills.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {matchedSkills.map(s => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-md bg-act px-2.5 py-1 text-xs font-semibold text-act-foreground border border-border"
                  >
                    <CheckCircle2 className="size-3 text-act-foreground" />
                    {s}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">None of your profile skills were matched directly.</p>
            )}
          </div>

          {/* Missing Skills (Skill Gap) */}
          <div className="rounded-xl border border-border bg-ask/20 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ask-foreground flex items-center gap-1.5">
              <HelpCircle className="size-3.5 text-ask-foreground" />
              Skill Gap ({missingSkills.length})
            </h3>
            {missingSkills.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {missingSkills.map(s => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-md bg-ask px-2.5 py-1 text-xs font-semibold text-ask-foreground border border-border"
                  >
                    {s}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Great news! You have all the stated skills listed.</p>
            )}
          </div>
        </div>
      </Card>

      {/* Structured Requirements Breakdown (X-02) */}
      <Card className="mt-6 p-6">
        <h2 className="text-xl font-semibold">Stated Requirements & Qualifications</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Separated into mandatory eligibility, required skills, preferred qualifications, and other constraints.
        </p>

        {mergedReqs.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {opportunity.requirements_status === 'EXTRACTION_INCOMPLETE'
              ? 'Extraction of requirements was incomplete. Please review the original listing text below.'
              : opportunity.requirements_status === 'NO_REQUIREMENTS_STATED'
              ? 'This opportunity states no restrictive eligibility requirements; open to all students.'
              : 'No explicit requirements were extracted from this listing. This does not automatically establish eligibility.'}
          </p>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Mandatory Eligibility */}
            {mandatoryEligibilityReqs.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-red-800 bg-red-50 border border-red-200 inline-block px-2.5 py-1 rounded-md">
                  Mandatory Eligibility ({mandatoryEligibilityReqs.length})
                </h3>
                <ul className="mt-3 space-y-3">
                  {mandatoryEligibilityReqs.map(r => (
                    <li key={r.id} className="p-3 bg-muted/20 rounded-lg border border-border">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase text-muted-foreground">{r.kind.replaceAll('_', ' ')}</span>
                        <span className="rounded bg-red-100 text-red-800 px-1.5 py-0.5 text-[10px] font-medium">Mandatory</span>
                      </div>
                      <p className="mt-1 text-sm font-medium">{r.value}</p>
                      {r.evidence_snippet && (
                        <blockquote className="mt-1.5 border-l-2 border-primary/40 pl-2.5 text-xs text-muted-foreground italic">
                          “{r.evidence_snippet}”
                        </blockquote>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Required Skills */}
            {requiredSkillsReqs.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-act-foreground bg-act border border-border inline-block px-2.5 py-1 rounded-md">
                  Required Technical Skills ({requiredSkillsReqs.length})
                </h3>
                <ul className="mt-3 space-y-3">
                  {requiredSkillsReqs.map(r => (
                    <li key={r.id} className="p-3 bg-muted/20 rounded-lg border border-border">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase text-muted-foreground">Skill Requirement</span>
                        <span className="rounded bg-act text-act-foreground border border-border px-1.5 py-0.5 text-[10px] font-semibold">Required</span>
                      </div>
                      <p className="mt-1 text-sm font-medium">{r.value}</p>
                      {r.evidence_snippet && (
                        <blockquote className="mt-1.5 border-l-2 border-primary/40 pl-2.5 text-xs text-muted-foreground italic">
                          “{r.evidence_snippet}”
                        </blockquote>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Preferred Skills */}
            {preferredSkillsReqs.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-800 bg-blue-50 border border-blue-200 inline-block px-2.5 py-1 rounded-md">
                  Preferred / Nice-to-Have Skills ({preferredSkillsReqs.length})
                </h3>
                <ul className="mt-3 space-y-3">
                  {preferredSkillsReqs.map(r => (
                    <li key={r.id} className="p-3 bg-muted/20 rounded-lg border border-border">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase text-muted-foreground">Preferred Skill</span>
                        <span className="rounded bg-blue-100 text-blue-800 px-1.5 py-0.5 text-[10px] font-medium">Optional</span>
                      </div>
                      <p className="mt-1 text-sm font-medium">{r.value}</p>
                      {r.evidence_snippet && (
                        <blockquote className="mt-1.5 border-l-2 border-primary/40 pl-2.5 text-xs text-muted-foreground italic">
                          “{r.evidence_snippet}”
                        </blockquote>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Other Requirements */}
            {otherReqs.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 bg-slate-100 border border-slate-200 inline-block px-2.5 py-1 rounded-md">
                  Other Constraints & Context ({otherReqs.length})
                </h3>
                <ul className="mt-3 space-y-3">
                  {otherReqs.map(r => (
                    <li key={r.id} className="p-3 bg-muted/20 rounded-lg border border-border">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase text-muted-foreground">{r.kind.replaceAll('_', ' ')}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium">{r.value}</p>
                      {r.evidence_snippet && (
                        <blockquote className="mt-1.5 border-l-2 border-primary/40 pl-2.5 text-xs text-muted-foreground italic">
                          “{r.evidence_snippet}”
                        </blockquote>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Preparation Section: Distinguish Source-Stated vs Optional Prep Suggestions (X-02) */}
      <Card className="mt-6 p-6">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <BookOpen className="size-5 text-primary" />
          Preparation & Action Guidance
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Clear distinction between source-stated mandatory requirements and recommended optional preparation.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {/* Source-Stated Requirements */}
          <div className="p-4 rounded-xl border border-border bg-slate-50">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-primary" />
              Source-Stated Requirements
            </h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Directly stated in the opportunity announcement by the employer.
            </p>
            <ul className="mt-3 space-y-2 text-xs text-foreground">
              {statedSkills.length > 0 ? (
                statedSkills.map(s => (
                  <li key={s} className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <strong>{s}</strong>: Verified technical requirement from source text
                  </li>
                ))
              ) : (
                <li className="text-muted-foreground">No explicit skills stated in source text.</li>
              )}
            </ul>
          </div>

          {/* Optional Preparation Suggestions */}
          <div className="p-4 rounded-xl border border-primary/30 bg-primary/5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Sparkles className="size-4 text-primary" />
              Optional Preparation Suggestions
            </h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Proactive readiness steps. These are optional suggestions, not stated prerequisites.
            </p>
            <ul className="mt-3 space-y-2 text-xs text-foreground">
              {missingSkills.length > 0 ? (
                missingSkills.slice(0, 3).map(s => (
                  <li key={s} className="flex items-start gap-1.5">
                    <span className="size-1.5 rounded-full bg-primary mt-1.5" />
                    <span>
                      Brush up on <strong>{s}</strong> fundamentals or review a relevant project before interviews.
                    </span>
                  </li>
                ))
              ) : (
                <li className="flex items-start gap-1.5">
                  <span className="size-1.5 rounded-full bg-primary mt-1.5" />
                  Review system design or coding problem sets for technical screenings.
                </li>
              )}
              <li className="flex items-start gap-1.5">
                <span className="size-1.5 rounded-full bg-primary mt-1.5" />
                Prepare portfolio project links demonstrating {matchedSkills.slice(0, 2).join(' and ') || 'relevant problem solving'}.
              </li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Resume Fit for this Role (X-06) */}
      <Card className="mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            <div>
              <h2 className="text-xl font-semibold">Resume Fit for this Role</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Deterministic comparison of your profile evidence against verified listing requirements.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-3 py-1 text-xs font-bold">
              {skillCoveragePct}% Technical Skill Coverage
            </span>
          </div>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-muted-foreground">
          <p className="font-semibold text-slate-800">Coverage Formula & Privacy Disclosure:</p>
          <p className="mt-1">
            Calculated as ({matchedSkills.length} matched skills / {totalStatedSkills || 1} stated skills) × 100%. This is an objective comparison against explicitly stated listing requirements. It does <strong>not</strong> represent an employer ATS pass probability or algorithmic screening outcome. Your private profile facts remain confidential and are never written to public feeds.
          </p>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3 text-xs">
          <div className="p-3.5 rounded-xl border border-border bg-card">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
              Academic Background
            </span>
            <p className="mt-1 font-medium text-foreground">
              {studentProfile?.degree ? `${studentProfile.degree.toUpperCase()} in ${studentProfile.branch || 'Engineering'}` : 'Not specified'}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {studentProfile?.cgpa ? `CGPA: ${studentProfile.cgpa}/10` : 'No CGPA on file'} · Year {studentProfile?.academic_year || 'N/A'}
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-border bg-card">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
              Skill Alignment
            </span>
            <p className="mt-1 font-medium text-foreground">
              {matchedSkills.length} of {totalStatedSkills} skills demonstrated
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground font-medium">
              {missingSkills.length === 0 ? 'Full coverage of stated skills' : `${missingSkills.length} skill gap(s) to address`}
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-border bg-card">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
              Readability & Completeness
            </span>
            <p className="mt-1 font-medium text-foreground">
              {studentProfile?.display_name ? 'Profile Verified' : 'Draft Incomplete'}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {(profileSkillsRes.data || []).length} confirmed skill entries in profile
            </p>
          </div>
        </div>

        {/* Actionable Resume Tailoring Suggestions */}
        <div className="mt-5 pt-4 border-t border-border">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Actionable Resume Tailoring Suggestions
          </h3>
          <ul className="mt-2.5 space-y-2 text-xs text-muted-foreground">
            {missingSkills.length > 0 ? (
              <li className="flex items-start gap-2">
                <span className="size-1.5 rounded-full bg-primary mt-1.5" />
                <span>
                  <strong>Highlight missing technical terms:</strong> If you have hands-on coursework, personal projects, or internships involving <strong>{missingSkills.join(', ')}</strong>, add bullet points with measurable impact before submitting.
                </span>
              </li>
            ) : (
              <li className="flex items-start gap-2">
                <span className="size-1.5 rounded-full bg-primary mt-1.5" />
                <span>
                  <strong>Strong keyword alignment:</strong> Your profile covers all explicitly extracted technical skills for this role.
                </span>
              </li>
            )}
            <li className="flex items-start gap-2">
              <span className="size-1.5 rounded-full bg-primary mt-1.5" />
              <span>
                <strong>Emphasize proven experience:</strong> Anchor your application around concrete deliverables demonstrating {matchedSkills.slice(0, 3).join(', ') || 'core competencies'}.
              </span>
            </li>
          </ul>
        </div>
      </Card>

      {/* "Why this decision?" with Collapsed Provenance and Quotes (X-02) */}
      <Card className="mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div>
            <h2 className="text-xl font-semibold">Why this decision?</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Algorithmic transparency: inspect the evaluation decision, semantic evidence, and raw provenance.
            </p>
          </div>
          {match?.decision && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                match.decision === 'ACT'
                  ? 'bg-act text-act-foreground border border-border'
                  : match.decision === 'ASK'
                  ? 'bg-ask text-ask-foreground border border-border'
                  : 'bg-skip text-skip-foreground border border-border'
              }`}
            >
              {match.eligibility_status === 'UNKNOWN' || match.reason_codes?.includes('UNKNOWN_ELIGIBILITY')
                ? `${match.decision} · Review facts`
                : match.match_score !== null && match.match_score !== undefined
                ? `${match.decision} · Score: ${match.match_score}/100`
                : `${match.decision} · Scoring deferred`}
            </span>
          )}
        </div>

        {match?.explanation ? (
          <div className="mt-4 p-4 rounded-lg bg-muted/30 border border-border text-sm leading-relaxed">
            <p className="font-medium text-foreground">{match.explanation}</p>
            {match.reason_codes && match.reason_codes.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {match.reason_codes.map(c => (
                  <span key={c} className="rounded bg-slate-200/70 text-slate-800 px-2 py-0.5 text-[10px] font-mono">
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">Evaluation awaiting completion.</p>
        )}

        {/* Semantic Evidence Quotes */}
        {match?.semantic_evidence && match.semantic_evidence.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Matched Evidence Quotes
            </h3>
            <div className="space-y-3">
              {match.semantic_evidence.map((se, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-slate-50 border text-xs">
                  <span className="font-semibold uppercase text-[10px] text-primary">{se.component}</span>
                  <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                    <div className="border-l-2 border-primary pl-2">
                      <span className="text-[10px] text-muted-foreground block font-medium">Opportunity Quote:</span>
                      <blockquote className="italic text-foreground">“{se.opportunity_quote}”</blockquote>
                    </div>
                    <div className="border-l-2 border-blue-400 pl-2">
                      <span className="text-[10px] text-muted-foreground block font-medium">Profile Quote:</span>
                      <blockquote className="italic text-foreground">“{se.profile_quote}”</blockquote>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Collapsed Provenance and Source Text */}
        <details className="mt-5 border-t border-border pt-4">
          <summary className="cursor-pointer text-xs font-semibold text-primary hover:underline flex items-center gap-1">
            <span>Inspect Raw Sources & Evidence Provenance ({provenance.length})</span>
            <ChevronDown className="size-3.5" />
          </summary>
          <div className="mt-4 space-y-4">
            {provenance.map(source => {
              const submission = submissions.data?.find(r => r.id === source.raw_item_id);
              return (
                <div key={source.raw_item_id} className="p-4 rounded-lg border border-border bg-muted/10 text-xs">
                  <p className="font-semibold text-sm">
                    {submission?.source_type === 'url'
                      ? 'Website announcement'
                      : submission?.source_type === 'email'
                      ? 'Forwarded email'
                      : 'Pasted announcement'}
                  </p>
                  {submission?.final_url && (
                    <a
                      href={submission.final_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block break-all text-xs text-primary hover:underline"
                    >
                      {submission.final_url}
                    </a>
                  )}
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Saved {submission ? formatDate(submission.created_at) : 'earlier'}
                    {submission?.fetched_at ? ` · Read ${formatDate(submission.fetched_at)}` : ''}
                  </p>

                  <ul className="mt-3 space-y-2">
                    {(source.extracted_json?.evidence || []).map((e, index) => (
                      <li key={index}>
                        <p className="text-[10px] uppercase font-semibold text-muted-foreground">
                          {e.field.replaceAll('_', ' ')}
                        </p>
                        <blockquote className="mt-0.5 border-l-2 border-primary/40 pl-2.5 text-xs text-foreground italic">
                          “{e.quote}”
                        </blockquote>
                      </li>
                    ))}
                  </ul>

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                      Read full source text
                    </summary>
                    <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-100 p-2 text-[11px] font-mono leading-relaxed">
                      {submission?.cleaned_text || submission?.raw_content || 'Source unavailable'}
                    </pre>
                  </details>
                </div>
              );
            })}
          </div>
        </details>
      </Card>
    </>
  );
}
