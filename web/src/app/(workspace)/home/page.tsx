import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { LiveUpdates } from '@/components/live-updates';
import { AutonomyCounter, type HomeCounterData } from '@/components/autonomy-counter';
import { formatDate } from '@/lib/utils';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Calendar,
  HelpCircle,
  ChevronRight,
  Zap,
} from 'lucide-react';

export default async function HomePage() {
  const { supabase, user } = await requireUser();
  const today = new Date().toISOString().slice(0, 10);

  // Fetch Home dashboard data concurrently
  const [counterRes, approvalsRes, clarificationsRes, matchesRes, upcomingRes, planRes] = await Promise.all([
    supabase.rpc('get_home_counter'),
    supabase
      .from('approvals')
      .select('id, match_id, match_revision, status, expires_at, created_at, match:matches(opportunity:opportunities(id, title, organization, deadline, type, trust_tier))')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .limit(5),
    supabase
      .from('clarifications')
      .select('id, missing_fact, requirement_kind, question_text, affected_opportunity_ids, status, created_at')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .limit(5),
    supabase
      .from('matches')
      .select('id, opportunity_id, decision, match_score, confidence, explanation, eligibility_status, opportunity:opportunities(id, title, organization, deadline, type, location, trust_tier)')
      .eq('user_id', user.id)
      .eq('status', 'complete')
      .order('match_score', { ascending: false })
      .limit(4),
    supabase
      .from('opportunities')
      .select('id, title, organization, deadline, type, location, trust_tier')
      .eq('user_id', user.id)
      .not('deadline', 'is', null)
      .gte('deadline', today)
      .order('deadline', { ascending: true })
      .limit(5),
    supabase
      .from('weekly_plans')
      .select('id, status, plan_week_start, scheduled_items')
      .eq('user_id', user.id)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const counterData = (counterRes.data || {
    items_read: 0,
    items_ignored: 0,
    items_acted: 0,
    items_asked: 0,
    questions_avoided: 0,
    active_rules: 0,
    pending_proposals: 0,
    breakdown: {
      real: { items_read: 0, questions_avoided: 0 },
      seeded: { items_read: 0, questions_avoided: 0 }
    }
  }) as HomeCounterData;

  const pendingApprovals = ((approvalsRes.data || []) as unknown as Array<{
    id: string;
    match_id: string;
    status: string;
    expires_at: string;
    match?: {
      opportunity: {
        id: string;
        title: string;
        organization: string | null;
        deadline: string | null;
        type: string;
        trust_tier: string | null;
      } | null;
    } | null;
    opportunity?: {
      id: string;
      title: string;
      organization: string | null;
      deadline: string | null;
      type: string;
      trust_tier: string | null;
    } | null;
  }>).map(appr => ({
    ...appr,
    opportunity: appr.match?.opportunity || appr.opportunity || null
  }));

  const pendingClarifications = (clarificationsRes.data || []) as Array<{
    id: string;
    missing_fact: string;
    requirement_kind: string;
    question_text: string;
    affected_opportunity_ids: string[];
  }>;

  const topMatches = (matchesRes.data || []) as unknown as Array<{
    id: string;
    opportunity_id: string;
    decision: string;
    match_score: number | null;
    confidence: number | null;
    explanation: string | null;
    eligibility_status: string | null;
    opportunity: {
      id: string;
      title: string;
      organization: string | null;
      deadline: string | null;
      type: string;
      location: string | null;
      trust_tier: string | null;
    } | null;
  }>;

  const upcomingDeadlines = (upcomingRes.data || []) as Array<{
    id: string;
    title: string;
    organization: string | null;
    deadline: string;
    type: string;
    location: string | null;
    trust_tier: string | null;
  }>;

  const draftPlan = planRes.data;

  // Next-Action Suggestion: Computed deterministically in code
  interface ActionSuggestion {
    title: string;
    description: string;
    cta: string;
    href: string;
    badge: string;
    badgeColor: string;
  }

  let nextAction: ActionSuggestion;

  if (pendingApprovals.length > 0) {
    const topAppr = pendingApprovals[0];
    nextAction = {
      badge: 'Immediate Action Required',
      badgeColor: 'bg-amber-100 text-amber-900 border-amber-200',
      title: `Approve: ${topAppr.opportunity?.title || 'Pending Request'}`,
      description: `OpportunityOS recommends action on ${topAppr.opportunity?.organization || 'this listing'}. Your explicit approval is required before action expiry.`,
      cta: 'Review Approval',
      href: `/approvals/${topAppr.id}`,
    };
  } else if (pendingClarifications.length > 0) {
    const topClar = pendingClarifications[0];
    nextAction = {
      badge: 'Unlock Opportunities',
      badgeColor: 'bg-sky-100 text-sky-900 border-sky-200',
      title: `Clarify ${topClar.missing_fact.replace('_', ' ')}`,
      description: `Answering this missing profile fact will automatically re-evaluate ${topClar.affected_opportunity_ids.length} matched opportunities.`,
      cta: 'Answer Question',
      href: '/approvals',
    };
  } else if (draftPlan) {
    nextAction = {
      badge: 'Planning Ready',
      badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-200',
      title: `Confirm Weekly Schedule (${draftPlan.plan_week_start})`,
      description: 'Your deterministic weekly plan draft is ready with task blocks placed before deadlines.',
      cta: 'Open Weekly Plan',
      href: '/plan',
    };
  } else if (topMatches.length > 0 && topMatches[0].decision === 'ACT') {
    const topAct = topMatches[0];
    nextAction = {
      badge: 'Top Recommendation',
      badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-200',
      title: `${topAct.opportunity?.title || 'Strong Match'} (${topAct.match_score ?? 90}%)`,
      description: `Verified ${topAct.opportunity?.type || 'opportunity'} from ${topAct.opportunity?.organization || 'an official source'}. Tracker updated.`,
      cta: 'View Opportunity',
      href: `/opportunities/${topAct.opportunity_id}`,
    };
  } else {
    nextAction = {
      badge: 'All Caught Up',
      badgeColor: 'bg-slate-100 text-slate-800 border-slate-200',
      title: 'Active Feeds Monitoring',
      description: 'OpportunityOS is scanning autonomous feeds, email alerts, and portal sources.',
      cta: 'Explore Opportunities',
      href: '/opportunities',
    };
  }

  return (
    <>
      <LiveUpdates userId={user.id} />

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Workspace Overview</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">Home</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Autonomous opportunity governance · Verified decisions · Time-boxed commitments
          </p>
        </div>
      </div>

      {/* 1. Autonomy Counter */}
      <AutonomyCounter data={counterData} />

      {/* 2. Next-Action Recommendation (Pure Code Logic) */}
      <Card className="mb-8 border-primary/20 bg-gradient-to-r from-primary/5 via-white to-primary/5 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${nextAction.badgeColor}`}>
                <Zap className="mr-1 size-3" />
                {nextAction.badge}
              </span>
              <span className="text-xs text-muted-foreground">Recommended Next Step</span>
            </div>
            <h2 className="text-lg font-bold text-foreground">{nextAction.title}</h2>
            <p className="text-sm text-muted-foreground">{nextAction.description}</p>
          </div>
          <Link
            href={nextAction.href}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-primary/90"
          >
            <span>{nextAction.cta}</span>
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </Card>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* 3. Grouped Questions & Actionable Reviews */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HelpCircle className="size-5 text-amber-600" />
              <h2 className="text-lg font-bold text-foreground">Actionable Reviews & Questions</h2>
            </div>
            {(pendingApprovals.length > 0 || pendingClarifications.length > 0) && (
              <Link href="/approvals" className="text-xs font-semibold text-primary hover:underline">
                View all ({pendingApprovals.length + pendingClarifications.length})
              </Link>
            )}
          </div>

          {pendingApprovals.length === 0 && pendingClarifications.length === 0 ? (
            <Card className="p-6 text-center">
              <CheckCircle2 className="mx-auto size-8 text-emerald-500" />
              <p className="mt-2 text-sm font-semibold">Zero pending review requests</p>
              <p className="mt-1 text-xs text-muted-foreground">
                All opportunities have been either acted on or ignored. The agent only asks when evidence is incomplete.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {pendingApprovals.map((appr) => (
                <Card key={appr.id} className="border-amber-200/80 bg-amber-50/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                        Approval Request (ASK)
                      </span>
                      <h3 className="mt-1.5 text-sm font-semibold text-foreground">
                        {appr.opportunity?.title || 'Opportunity Review'}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {appr.opportunity?.organization || 'Unknown Organization'} · Expires {formatDate(appr.expires_at)}
                      </p>
                    </div>
                    <Link
                      href={`/approvals/${appr.id}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-2xs hover:bg-amber-50"
                    >
                      <span>Review</span>
                      <ArrowRight className="size-3" />
                    </Link>
                  </div>
                </Card>
              ))}

              {pendingClarifications.map((clar) => (
                <Card key={clar.id} className="border-sky-200/80 bg-sky-50/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-900">
                        Missing Fact Clarification
                      </span>
                      <h3 className="mt-1.5 text-sm font-semibold text-foreground">
                        {clar.question_text || `Confirm your ${clar.missing_fact}`}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Affects {clar.affected_opportunity_ids.length} opportunity listing{clar.affected_opportunity_ids.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <Link
                      href="/approvals"
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900 shadow-2xs hover:bg-sky-50"
                    >
                      <span>Clarify</span>
                      <ArrowRight className="size-3" />
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* 4. Confirmed Upcoming Deadlines */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="size-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">Confirmed Deadlines</h2>
            </div>
            <Link href="/plan" className="text-xs font-semibold text-primary hover:underline">
              Open Weekly Plan
            </Link>
          </div>

          {upcomingDeadlines.length === 0 ? (
            <Card className="p-6 text-center">
              <Calendar className="mx-auto size-8 text-muted-foreground/60" />
              <p className="mt-2 text-sm font-semibold">No upcoming deadlines</p>
              <p className="mt-1 text-xs text-muted-foreground">
                All active opportunities either have passed or have unconfirmed deadlines.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {upcomingDeadlines.map((opp) => (
                <Card key={opp.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {opp.type}
                        </span>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.2 text-[11px] font-semibold text-emerald-800">
                          Due {opp.deadline}
                        </span>
                      </div>
                      <h3 className="mt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors">
                        <Link href={`/opportunities/${opp.id}`}>{opp.title}</Link>
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {opp.organization || 'Unknown'} {opp.location ? `· ${opp.location}` : ''}
                      </p>
                    </div>
                    <Link
                      href={`/opportunities/${opp.id}`}
                      className="inline-flex size-7 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
                    >
                      <ChevronRight className="size-4" />
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 5. Strongest Current Matches */}
      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Strongest Current Matches</h2>
            <p className="text-xs text-muted-foreground">
              Ranked by deterministic score weights (Skills 40%, Career 20%, Interests 15%, Location 10%, Academic 10%, Urgency 5%)
            </p>
          </div>
          <Link href="/opportunities" className="text-sm font-semibold text-primary hover:underline">
            Browse all opportunities →
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {topMatches.map((m) => {
            const opp = m.opportunity;
            const isAct = m.decision === 'ACT';
            const isAsk = m.decision === 'ASK';
            const badgeClass = isAct
              ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
              : isAsk
              ? 'bg-amber-100 text-amber-900 border-amber-200'
              : 'bg-slate-100 text-slate-800 border-slate-200';

            return (
              <Card key={m.id} className="flex flex-col justify-between p-4 shadow-xs hover:border-primary/40 transition">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {opp?.type || 'Opportunity'}
                    </span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeClass}`}>
                      {m.decision} · {m.match_score ?? 'N/A'}/100
                    </span>
                  </div>

                  <h3 className="mt-2 text-sm font-bold text-foreground line-clamp-2">
                    <Link href={`/opportunities/${m.opportunity_id}`} className="hover:text-primary transition-colors">
                      {opp?.title || 'Opportunity'}
                    </Link>
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                    {opp?.organization || 'Unknown'} {opp?.location ? `· ${opp.location}` : ''}
                  </p>

                  <p className="mt-3 text-xs text-muted-foreground line-clamp-2">
                    {m.explanation || 'Evaluated against confirmed profile criteria.'}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {opp?.deadline ? `Due ${opp.deadline}` : 'Deadline not stated'}
                  </span>
                  <Link
                    href={`/opportunities/${m.opportunity_id}`}
                    className="font-semibold text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <span>Inspect</span>
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </>
  );
}
