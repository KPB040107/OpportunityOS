'use client';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { deadlineLabel, trustBadgeDetails, extractCompensationDetails } from '@/lib/analysis';

export interface OpportunityCardProps {
  opportunity: {
    id: string;
    title: string;
    organization?: string | null;
    type?: string;
    location?: string | null;
    deadline?: string | null;
    deadline_display?: string | null;
    deadline_time?: string | null;
    fields?: {
      deadline_display?: string | null;
      deadline_time?: string | null;
      [key: string]: unknown;
    };
    extracted_json?: {
      fields?: {
        deadline_display?: string | null;
        deadline_time?: string | null;
      };
      deadline_display?: string | null;
      deadline_time?: string | null;
      [key: string]: unknown;
    };
    skills?: string[];
    trust_tier?: string;
    source_badge?: string | null;
    risk_signals?: string[];
    seniority_level?: string;
    is_saved?: boolean;
    is_hidden?: boolean;
    match?: {
      id?: string;
      decision?: 'ACT' | 'ASK' | 'IGNORE' | null;
      eligibility_status?: string | null;
      match_score?: number | null;
      confidence?: number | null;
      explanation?: string | null;
      reason_codes?: string[] | null;
    } | null;
  };
  onSave?: (id: string) => void;
  onHide?: (id: string) => void;
}

export function OpportunityCard({ opportunity }: OpportunityCardProps) {
  const opp = opportunity;
  const badge = trustBadgeDetails(opp.trust_tier || '', opp.source_badge || null);
  const match = opp.match;
  const comp = extractCompensationDetails(opp);

  const isUnknown =
    match?.eligibility_status === 'UNKNOWN' ||
    match?.reason_codes?.includes('UNKNOWN_ELIGIBILITY');

  const isInsufficient =
    isUnknown ||
    (match?.match_score === 0 && (!match?.confidence || match?.confidence === 0));

  // Determine deadline clearly, including time/timezone if present
  const deadlineDisplay =
    opp.fields?.deadline_display ||
    opp.deadline_display ||
    opp.extracted_json?.fields?.deadline_display ||
    opp.extracted_json?.deadline_display;
  const deadlineTime =
    opp.fields?.deadline_time ||
    opp.deadline_time ||
    opp.extracted_json?.fields?.deadline_time ||
    opp.extracted_json?.deadline_time;

  let formattedDeadline: string = deadlineDisplay || '';
  if (!formattedDeadline) {
    const base = deadlineLabel(opp.deadline || null);
    if (deadlineTime && base !== 'Deadline passed' && base !== 'No deadline stated' && base !== 'Rolling / closing soon') {
      formattedDeadline = `${base} (${deadlineTime})`;
    } else {
      formattedDeadline = base;
    }
  }

  return (
    <Card
      className={`p-5 flex flex-col justify-between transition-shadow hover:shadow-sm ${
        opp.is_hidden ? 'opacity-50 border-dashed' : ''
      }`}
    >
      <div>
        {/* Top Badges */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              {opp.type || 'Opportunity'}
            </span>
            {opp.seniority_level && opp.seniority_level !== 'uncertain' && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium capitalize text-slate-700">
                {opp.seniority_level}
              </span>
            )}
            {opp.is_saved && (
              <span className="rounded-full bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold">
                Saved
              </span>
            )}
          </div>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${badge.className}`}>
            {badge.label}
          </span>
        </div>

        {/* Title & Employer */}
        <h3 className="text-lg font-semibold leading-snug">
          <Link href={`/opportunities/${opp.id}`} className="hover:text-primary transition-colors">
            {opp.title || 'Untitled Opportunity'}
          </Link>
        </h3>
        <p className="mt-1 text-xs text-muted-foreground font-medium text-foreground">
          {opp.organization || 'Organisation unknown'}
        </p>

        {/* Risk Signals */}
        {opp.risk_signals && opp.risk_signals.length > 0 && (
          <p className="mt-2 text-xs font-medium text-red-700 bg-red-50 p-2 rounded-lg border border-red-200">
            Risk Signal: {opp.risk_signals.join(' · ')}
          </p>
        )}

        {/* Details dl */}
        <dl className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
          <div>
            <dt className="text-[11px]">Deadline</dt>
            <dd className="font-medium text-foreground truncate">{formattedDeadline}</dd>
          </div>
          <div>
            <dt className="text-[11px]">Location</dt>
            <dd className="font-medium text-foreground truncate">{opp.location || 'Unknown'}</dd>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <dt className="text-[11px]">{comp.label}</dt>
            <dd className="font-medium text-foreground truncate flex items-center gap-1.5">
              <span>{comp.value}</span>
              {comp.paidStatus && comp.paidStatus !== 'Not disclosed' && (
                <span className={`rounded px-1.5 py-0.2 text-[9px] font-semibold uppercase ${
                  comp.paidStatus === 'Paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {comp.paidStatus}
                </span>
              )}
            </dd>
          </div>
        </dl>

        {/* Skills */}
        {opp.skills && opp.skills.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {opp.skills.slice(0, 4).map((s) => (
              <span key={s} className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {s}
              </span>
            ))}
            {opp.skills.length > 4 && (
              <span className="text-[10px] text-muted-foreground self-center">
                +{opp.skills.length - 4} more
              </span>
            )}
          </div>
        )}

        {/* Decision & Honest Score */}
        <div className="mt-4 pt-3 border-t border-border">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            {match?.decision ? (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  match.decision === 'ACT'
                    ? 'bg-emerald-100 text-emerald-900'
                    : match.decision === 'ASK'
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {match.decision}
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                Awaiting Evaluation
              </span>
            )}

            {/* Honest Score Rendering: If UNKNOWN, suppress numerical score and show 'Review facts' */}
            {isUnknown ? (
              <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                Review facts
              </span>
            ) : isInsufficient ? (
              <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                Insufficient information to score
              </span>
            ) : match?.match_score !== null && match?.match_score !== undefined ? (
              <span className="text-xs text-muted-foreground font-medium">
                Match {match.match_score}/100 · {Math.round((match.confidence || 0) * 100)}% confidence
              </span>
            ) : null}
          </div>
          {match?.explanation && (
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {match.explanation}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

export default OpportunityCard;
