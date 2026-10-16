import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { ResolveButtons } from './resolve-button';
import { ClarificationCard, type ClarificationItem } from './clarification-card';
import { SourceReviewCard, type SourceReviewItem } from './source-review-card';
import { formatDate } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, ArrowRight, HelpCircle, AlertCircle } from 'lucide-react';
import type { Approval } from '@/lib/types';
import { LiveUpdates } from '@/components/live-updates';
import { requestTime } from '@/lib/server-clock';
import { RetryWork } from '@/components/retry-work';

export default async function ApprovalsPage() {
  const { supabase, user } = await requireUser();
  const checkedAt = await requestTime();

  // 1. Fetch approvals
  const approvalsQuery = supabase
    .from('approvals')
    .select(`
      id,
      user_id,
      match_id,
      reason,
      missing_info,
      status,
      match_revision,
      expires_at,
      requires_information,
      resume_status,
      decided_at,
      created_at,
      match:matches(
        id,
        match_score,
        confidence,
        eligibility_status,
        opportunity:opportunities(id, title, organization, deadline, application_url, type)
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // 2. Fetch pending clarifications (Needs Information)
  const clarificationsQuery = supabase
    .from('clarifications')
    .select('id, missing_fact, requirement_kind, question_text, affected_opportunity_ids, status, created_at')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  // 3. Fetch unknown source reviews (Needs Source Review)
  const sourceReviewsQuery = supabase
    .from('matches')
    .select(`
      id,
      eligibility_status,
      decision,
      explanation,
      opportunity:opportunities(
        id,
        title,
        organization,
        type,
        location,
        application_url,
        risk_signals
      )
    `)
    .eq('user_id', user.id)
    .eq('decision', 'ASK')
    .eq('eligibility_status', 'UNKNOWN')
    .order('updated_at', { ascending: false })
    .limit(20);

  // 4. Fetch user interactions for source reviews
  const interactionsQuery = supabase
    .from('user_opportunity_interactions')
    .select('opportunity_id, is_saved, is_hidden')
    .eq('user_id', user.id);

  // 5. Fetch tracked applications to flag already tracked opportunities
  const applicationsQuery = supabase
    .from('applications')
    .select('opportunity_id')
    .eq('user_id', user.id);

  const [approvalsRes, clarificationsRes, sourceReviewsRes, interactionsRes, applicationsRes] = await Promise.all([
    approvalsQuery,
    clarificationsQuery,
    sourceReviewsQuery,
    interactionsQuery,
    applicationsQuery
  ]);

  if (approvalsRes.error || clarificationsRes.error || sourceReviewsRes.error || interactionsRes.error || applicationsRes.error) {
    throw new Error('Approval center data unavailable');
  }

  const allApprovals = (approvalsRes.data || []) as unknown as (Approval & {
    match?: {
      id: string;
      match_score: number | null;
      confidence: number | null;
      eligibility_status?: string | null;
      opportunity?: {
        id: string;
        title: string;
        organization: string;
        deadline: string | null;
        application_url: string | null;
        type: string;
      };
    };
  })[];

  // Actionable approvals are strictly ELIGIBLE
  const pendingActionableApprovals = allApprovals.filter(
    (a) => a.status === 'pending' && !a.requires_information && a.match?.eligibility_status === 'ELIGIBLE'
  );

  const resolvedApprovals = allApprovals.filter((a) => a.status !== 'pending');

  const pendingClarifications = (clarificationsRes.data || []) as ClarificationItem[];

  const interactionsMap = new Map((interactionsRes.data || []).map((i) => [i.opportunity_id, i]));
  const trackedSet = new Set((applicationsRes.data || []).map((a) => a.opportunity_id));

  type SourceReviewMatch = {
    id: string;
    explanation?: string | null;
    opportunity: {
      id: string;
      title: string;
      organization: string;
      type: string;
      location: string | null;
      application_url: string | null;
      risk_signals: string[] | null;
    };
  };

  const sourceReviews: SourceReviewItem[] = ((sourceReviewsRes.data || []) as unknown as SourceReviewMatch[])
    .filter((m) => m.opportunity && !interactionsMap.get(m.opportunity.id)?.is_hidden)
    .map((m) => {
      const opp = m.opportunity;
      const inter = interactionsMap.get(opp.id);
      return {
        id: opp.id,
        title: opp.title,
        organization: opp.organization,
        type: opp.type,
        location: opp.location,
        application_url: opp.application_url,
        risk_signals: opp.risk_signals || [],
        explanation: m.explanation || undefined,
        is_saved: inter?.is_saved ?? false,
        is_hidden: inter?.is_hidden ?? false,
        is_tracked: trackedSet.has(opp.id)
      };
    });

  return (
    <div className="space-y-8">
      <LiveUpdates userId={user.id} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Review & Approval Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Human-in-the-loop review queue. Actionable approvals require human sign-off; missing facts and source details can be inspected and updated below.
        </p>
      </div>

      {/* 1. Actionable Approvals (ELIGIBLE items needing human authorization) */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <span>Actionable Approvals</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
            {pendingActionableApprovals.length}
          </span>
        </h2>

        {pendingActionableApprovals.length === 0 ? (
          <Card className="p-8 text-center bg-muted/30">
            <CheckCircle2 className="mx-auto size-8 text-emerald-600" />
            <h3 className="mt-3 text-sm font-semibold">No pending approvals</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              There are no eligible opportunities awaiting your permission. Items needing facts or source checks appear below.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {pendingActionableApprovals.map((appr) => {
              const opp = appr.match?.opportunity;
              const match = appr.match;
              return (
                <Card key={appr.id} className="p-5 border-amber-200/80 bg-amber-50/20">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">
                          Eligible · Needs Human Sign-off
                        </span>
                        {opp?.type && (
                          <span className="text-xs uppercase text-muted-foreground font-medium">
                            {opp.type}
                          </span>
                        )}
                        {match?.match_score !== null && match?.match_score !== undefined && (
                          <span className="text-xs text-muted-foreground">
                            Match Score: {match.match_score}/100
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-semibold">
                        {opp?.id ? (
                          <Link href={`/opportunities/${opp.id}`} className="hover:text-primary transition-colors">
                            {opp.title || 'Untitled Opportunity'}
                          </Link>
                        ) : (
                          opp?.title || 'Untitled Opportunity'
                        )}
                      </h3>
                      <p className="text-sm text-muted-foreground">{opp?.organization || 'Unknown Organisation'}</p>

                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                        <p className="font-medium flex items-center gap-1.5 text-xs">
                          <AlertTriangle className="size-4 text-amber-600 shrink-0" />
                          Why approval is required:
                        </p>
                        <p className="mt-1 text-xs leading-relaxed">{appr.reason}</p>
                      </div>
                    </div>

                    <div className="sm:shrink-0 flex flex-col items-end gap-3">
                      <ResolveButtons
                        approvalId={appr.id}
                        revision={appr.match_revision}
                        requiresInformation={false}
                        expired={new Date(appr.expires_at).getTime() <= checkedAt}
                      />
                      <span className="text-xs text-muted-foreground">
                        Expires {formatDate(appr.expires_at)} · Execution: {appr.resume_status}
                      </span>
                    </div>
                  </div>

                  {opp?.id && (
                    <div className="mt-4 pt-3 border-t border-border flex justify-end">
                      <Link
                        href={`/opportunities/${opp.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        Inspect Full AI Breakdown & Quotes
                        <ArrowRight className="size-3" />
                      </Link>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Needs Information (Grouped Clarifications for Missing Profile Facts) */}
      {pendingClarifications.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <HelpCircle className="size-5 text-sky-600" />
              <span>Needs Information</span>
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-900">
                {pendingClarifications.length}
              </span>
            </h2>
            <Link href="/profile" className="text-xs font-semibold text-primary hover:underline">
              Edit full profile →
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            These questions resolve missing profile facts. Answering once updates your profile and immediately re-evaluates all affected opportunities.
          </p>
          <div className="grid gap-3">
            {pendingClarifications.map((c) => (
              <ClarificationCard key={c.id} clarification={c} />
            ))}
          </div>
        </div>
      )}

      {/* 3. Needs Source Review (Listings with insufficient requirements / unverified details) */}
      {sourceReviews.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <AlertCircle className="size-5 text-amber-600" />
              <span>Source Review</span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                {sourceReviews.length}
              </span>
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Listings that lack explicit employer requirements, have unverified claims, or contain sparse details. These cannot be approved because no actionable criteria exist. You can save, hide, or view the original listing.
          </p>
          <div className="grid gap-3">
            {sourceReviews.map((item) => (
              <SourceReviewCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* 4. Resolved Approvals History */}
      {resolvedApprovals.length > 0 && (
        <details className="space-y-3 pt-6 border-t border-border">
          <summary className="cursor-pointer text-base font-semibold text-muted-foreground">Resolved Approvals History ({resolvedApprovals.length})</summary>
          <div className="grid gap-2">
            {resolvedApprovals.map((appr) => {
              const opp = appr.match?.opportunity;
              return (
                <div
                  key={appr.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-border bg-card text-xs"
                >
                  <div className="space-y-0.5">
                    <p className="font-medium text-foreground">
                      {opp?.title || 'Opportunity'} ({opp?.organization || 'Organisation'})
                    </p>
                    <p className="text-muted-foreground">
                      Decision: <span className="font-semibold uppercase">{appr.status}</span> · Resolved {formatDate(appr.decided_at || appr.created_at)}
                    </p>
                    <p className="text-muted-foreground">Execution: {appr.resume_status}</p>
                    {appr.resume_status === 'failed' && new Date(appr.expires_at).getTime() > checkedAt && (
                      <RetryWork id={appr.id} kind="resume" />
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-semibold capitalize ${
                      appr.status === 'approved'
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-red-50 text-red-800'
                    }`}
                  >
                    {appr.status}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
