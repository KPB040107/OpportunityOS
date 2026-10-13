import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { ResolveButtons } from './resolve-button';
import { formatDate } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import type { Approval } from '@/lib/types';
import {LiveUpdates} from '@/components/live-updates';
import {requestTime} from '@/lib/server-clock';
import {RetryWork} from '@/components/retry-work';

export default async function ApprovalsPage() {
  const { supabase, user } = await requireUser();
  const checkedAt=await requestTime();

  const { data: rawApprovals, error } = await supabase
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
        opportunity:opportunities(id, title, organization, deadline, application_url, type)
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error('Approval center data unavailable');
  }

  const allApprovals = (rawApprovals || []) as unknown as (Approval & {
    match?: {
      id: string;
      match_score: number | null;
      confidence: number | null;
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

  const pendingApprovals = allApprovals.filter((a) => a.status === 'pending');
  const resolvedApprovals = allApprovals.filter((a) => a.status !== 'pending');

  return (
    <div className="space-y-8">
      <LiveUpdates userId={user.id}/>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Approval Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Human-in-the-loop review queue. When the agent is uncertain or finds incomplete requirements (ASK), it pauses and requests your permission before acting.
        </p>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <span>Pending Approvals</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
            {pendingApprovals.length}
          </span>
        </h2>

        {pendingApprovals.length === 0 ? (
          <Card className="p-8 text-center bg-muted/30">
            <CheckCircle2 className="mx-auto size-8 text-emerald-600" />
            <h3 className="mt-3 text-sm font-semibold">All caught up!</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              No opportunities currently require your review. High-confidence matches are handled autonomously.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {pendingApprovals.map((appr) => {
              const opp = appr.match?.opportunity;
              const match = appr.match;
              return (
                <Card key={appr.id} className="p-5 border-amber-200/80 bg-amber-50/20">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                          Needs Review
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
                        <p className="font-medium flex items-center gap-1.5">
                          <AlertTriangle className="size-4 text-amber-600 shrink-0" />
                          Why the agent paused:
                        </p>
                        <p className="mt-1 text-xs leading-relaxed">{appr.reason}</p>
                        {appr.missing_info?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {appr.missing_info.map((flag) => (
                              <span key={flag} className="rounded bg-white/80 border border-amber-300 px-2 py-0.5 text-[11px] font-mono text-amber-900">
                                {flag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="sm:shrink-0 flex flex-col items-end gap-3">
                      <ResolveButtons approvalId={appr.id} revision={appr.match_revision} requiresInformation={appr.requires_information} expired={new Date(appr.expires_at).getTime()<=checkedAt}/>
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

      {resolvedApprovals.length > 0 && (
        <div className="space-y-3 pt-6 border-t border-border">
          <h2 className="text-base font-semibold text-muted-foreground">Resolved Approvals History</h2>
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
                    {appr.resume_status==='failed'&&new Date(appr.expires_at).getTime()>checkedAt&&<RetryWork id={appr.id} kind="resume"/>}
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
        </div>
      )}
    </div>
  );
}
