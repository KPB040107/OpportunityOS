import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { LiveUpdates } from '@/components/live-updates';
import { AutonomyCounter, type HomeCounterData } from '@/components/autonomy-counter';
import { formatDate } from '@/lib/utils';
import {
  ArrowRight,
  CheckCircle2,
  Calendar,
  ChevronRight
} from 'lucide-react';

export default async function HomePage() {
  const { supabase, user } = await requireUser();
  const today = new Date().toISOString().slice(0, 10);

  // Fetch Home dashboard data concurrently
  const [profileRes, counterRes, approvalsRes, clarificationsRes, matchesRes, upcomingRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .maybeSingle(),
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
      .limit(5)
  ]);

  const studentName = profileRes.data?.display_name || 'there';

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
  }>).map((appr) => ({
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

  // Next-Action Suggestion: Computed deterministically
  interface ActionSuggestion {
    title: string;
    description: string;
    cta: string;
    href: string;
    kicker: string;
  }

  let nextAction: ActionSuggestion;

  if (pendingApprovals.length > 0) {
    const topAppr = pendingApprovals[0];
    nextAction = {
      kicker: 'YOUR NEXT STEP · IMMEDIATE APPROVAL REQUIRED',
      title: `Approve: ${topAppr.opportunity?.title || 'Pending Request'}`,
      description: `Trajectory recommends action on ${topAppr.opportunity?.organization || 'this listing'}. Your explicit approval is required before action expiry.`,
      cta: 'Review Approval',
      href: `/approvals/${topAppr.id}`
    };
  } else if (pendingClarifications.length > 0) {
    const topClar = pendingClarifications[0];
    nextAction = {
      kicker: 'YOUR NEXT STEP · CLARIFY PROFILE FACT',
      title: `Clarify ${topClar.missing_fact.replace('_', ' ')}`,
      description: `Answering this missing profile fact will automatically re-evaluate ${topClar.affected_opportunity_ids.length} matched opportunities.`,
      cta: 'Answer Question',
      href: '/approvals'
    };
  } else if (topMatches.length > 0 && topMatches[0].decision === 'ACT') {
    const topAct = topMatches[0];
    nextAction = {
      kicker: 'YOUR NEXT STEP · TOP RECOMMENDATION',
      title: `Apply to ${topAct.opportunity?.title || 'Strong Match'} (${topAct.match_score ?? 90}%)`,
      description: `Verified ${topAct.opportunity?.type || 'opportunity'} from ${topAct.opportunity?.organization || 'an official source'}. Added to calendar tracker.`,
      cta: 'Open Application',
      href: `/opportunities/${topAct.opportunity_id}`
    };
  } else {
    nextAction = {
      kicker: 'YOUR NEXT STEP · ALL CAUGHT UP',
      title: 'Active Feeds Monitoring',
      description: 'Trajectory is actively monitoring feeds, official portal alerts, and deadlines.',
      cta: 'Explore Opportunities',
      href: '/opportunities'
    };
  }

  const currentDateFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).toUpperCase();

  const totalWaiting = pendingApprovals.length + pendingClarifications.length;

  return (
    <div className="flex flex-col gap-8 font-sans text-foreground">
      <LiveUpdates userId={user.id} />

      {/* Date & Main Greeting */}
      <div className="flex flex-col gap-2">
        <span className="font-mono text-xs tracking-[0.12em] text-accent-text font-semibold uppercase">
          {currentDateFormatted}
        </span>
        <h1 className="font-display font-extrabold text-4xl sm:text-5xl lg:text-6xl tracking-tight leading-none text-foreground m-0">
          Good day, {studentName}.
        </h1>
        <p className="text-base sm:text-lg text-ink-2 leading-relaxed m-0">
          Since yesterday: {counterData.items_read} listings read, {counterData.items_acted} handled for you, {totalWaiting} waiting on you.
        </p>
      </div>

      {/* 1. Bento Stat Cards & Dividend */}
      <AutonomyCounter data={counterData} />

      {/* 2. Next-Action Banner (The Sorting Board Hero) */}
      <section className="p-6 sm:p-7 border-[1.5px] border-border rounded-[16px] bg-primary shadow-hard-lg flex flex-wrap items-center justify-between gap-6 text-foreground">
        <div className="flex-1 min-w-[280px] max-w-[620px] flex flex-col gap-2">
          <span className="font-mono text-xs tracking-[0.12em] text-foreground font-bold">
            {nextAction.kicker}
          </span>
          <h2 className="font-display font-extrabold text-2xl sm:text-4xl tracking-tight leading-tight m-0 text-foreground">
            {nextAction.title}
          </h2>
          <p className="text-sm sm:text-base text-foreground/90 font-medium leading-relaxed m-0">
            {nextAction.description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={nextAction.href}
            className="inline-flex items-center justify-center h-12 px-6 border-[1.5px] border-border rounded-[12px] bg-white text-foreground font-sans text-sm font-bold shadow-[2px_2px_0_#111111] hover:scale-[1.02] active:translate-x-0.5 active:translate-y-0.5 transition-all no-underline"
          >
            {nextAction.cta} →
          </Link>
          <Link
            href="/opportunities"
            className="inline-flex items-center justify-center h-12 px-6 border-[1.5px] border-border rounded-[12px] bg-white text-foreground font-sans text-sm font-bold shadow-[2px_2px_0_#111111] hover:bg-muted transition-all no-underline"
          >
            Browse All →
          </Link>
        </div>
      </section>

      {/* 3. Split: Waiting on you & Deadlines this week */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Waiting on you */}
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display font-bold text-2xl text-foreground m-0">
              Waiting on you
            </h2>
            <Link
              href="/approvals"
              className="text-xs font-mono font-semibold text-accent-text hover:underline"
            >
              All {totalWaiting} →
            </Link>
          </div>

          {totalWaiting === 0 ? (
            <div className="p-8 border-[1.5px] border-border rounded-[14px] bg-white shadow-hard text-center flex flex-col items-center gap-2">
              <CheckCircle2 className="size-8 text-foreground" />
              <p className="font-display font-bold text-base text-foreground m-0">
                Zero pending review requests
              </p>
              <p className="text-xs text-muted-foreground m-0 max-w-sm">
                All opportunities have been either acted on or ignored. Trajectory only asks when evidence is incomplete.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {pendingApprovals.map((appr) => (
                <div
                  key={appr.id}
                  className="p-4 sm:p-5 border-[1.5px] border-border rounded-[12px] bg-white shadow-hard flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2.5 py-0.5 border-[1.5px] border-border rounded-full bg-act text-foreground font-mono text-[11px] font-semibold">
                      APPROVE
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      EXPIRES {formatDate(appr.expires_at).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-base text-foreground m-0">
                      {appr.opportunity?.title || 'Opportunity Review'}
                    </h3>
                    <p className="text-xs text-ink-2 m-0 mt-0.5">
                      {appr.opportunity?.organization || 'Unknown Organization'} · Requires your confirmation
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Link
                      href={`/approvals/${appr.id}`}
                      className="inline-flex items-center justify-center h-9 px-4 border-[1.5px] border-border rounded-[8px] bg-white text-foreground text-xs font-sans font-bold shadow-[2px_2px_0_#111111] hover:scale-[1.01] active:translate-x-0.5 active:translate-y-0.5 transition-all no-underline"
                    >
                      Approve →
                    </Link>
                    <Link
                      href={`/approvals/${appr.id}`}
                      className="inline-flex items-center justify-center h-9 px-4 border-[1.5px] border-border rounded-[8px] bg-white text-foreground text-xs font-sans font-semibold hover:bg-muted transition-all no-underline"
                    >
                      Review
                    </Link>
                  </div>
                </div>
              ))}

              {pendingClarifications.map((clar) => (
                <div
                  key={clar.id}
                  className="p-4 sm:p-5 border-[1.5px] border-border rounded-[12px] bg-white shadow-hard flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2.5 py-0.5 border-[1.5px] border-border rounded-full bg-ask text-foreground font-mono text-[11px] font-semibold">
                      QUESTION
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      AFFECTS {clar.affected_opportunity_ids.length} LISTING{clar.affected_opportunity_ids.length === 1 ? '' : 'S'}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-base text-foreground m-0">
                      {clar.question_text || `Confirm your ${clar.missing_fact.replace('_', ' ')}`}
                    </h3>
                    <p className="text-xs text-ink-2 m-0 mt-0.5">
                      Missing profile fact needed to evaluate eligibility
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Link
                      href="/approvals"
                      className="inline-flex items-center justify-center h-9 px-4 border-[1.5px] border-border rounded-[8px] bg-white text-foreground text-xs font-sans font-bold shadow-[2px_2px_0_#111111] hover:scale-[1.01] active:translate-x-0.5 active:translate-y-0.5 transition-all no-underline"
                    >
                      Answer Now →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Deadlines this week */}
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display font-bold text-2xl text-foreground m-0">
              Deadlines this week
            </h2>
            <Link
              href="/applications"
              className="text-xs font-mono font-semibold text-accent-text hover:underline"
            >
              Tracker →
            </Link>
          </div>

          {upcomingDeadlines.length === 0 ? (
            <div className="p-8 border-[1.5px] border-border rounded-[14px] bg-white shadow-hard text-center flex flex-col items-center gap-2">
              <Calendar className="size-8 text-muted-foreground" />
              <p className="font-display font-bold text-base text-foreground m-0">
                No upcoming deadlines
              </p>
              <p className="text-xs text-muted-foreground m-0 max-w-sm">
                All tracked opportunities either have passed or have unconfirmed dates.
              </p>
            </div>
          ) : (
            <div className="border-[1.5px] border-border rounded-[14px] bg-white shadow-hard divide-y divide-line overflow-hidden">
              {upcomingDeadlines.map((opp) => {
                const dateObj = new Date(opp.deadline);
                const dow = isNaN(dateObj.getTime())
                  ? 'DUE'
                  : dateObj.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
                const dayNum = isNaN(dateObj.getTime())
                  ? '!'
                  : dateObj.getDate();

                return (
                  <div
                    key={opp.id}
                    className="p-4 flex items-center gap-4 hover:bg-[#F3F1EC]/40 transition-colors"
                  >
                    <div className="shrink-0 w-12 text-center flex flex-col">
                      <span className="font-mono text-[11px] font-bold text-accent-text leading-tight">
                        {dow}
                      </span>
                      <span className="font-display font-extrabold text-2xl text-accent-text leading-tight">
                        {dayNum}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <Link
                        href={`/opportunities/${opp.id}`}
                        className="text-sm font-bold text-foreground truncate hover:text-accent-text no-underline"
                      >
                        {opp.title}
                      </Link>
                      <span className="text-xs text-muted-foreground truncate">
                        {opp.type.toUpperCase()} · {opp.organization || 'Organization'}
                      </span>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full border-[1.5px] border-border bg-act font-mono text-[10px] font-semibold text-accent-text whitespace-nowrap">
                        ON CALENDAR
                      </span>
                      <Link
                        href={`/opportunities/${opp.id}`}
                        className="size-7 rounded-[6px] border-[1.5px] border-border bg-white flex items-center justify-center text-foreground hover:bg-muted"
                      >
                        <ChevronRight className="size-4" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* 4. Strongest Current Matches */}
      <section className="flex flex-col gap-3 pt-2">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="font-display font-bold text-2xl text-foreground m-0">
              Strongest matches
            </h2>
            <p className="text-xs text-muted-foreground m-0 mt-1">
              Ranked by deterministic score weights against your confirmed profile
            </p>
          </div>
          <Link
            href="/opportunities"
            className="text-xs font-mono font-semibold text-accent-text hover:underline"
          >
            All opportunities →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {topMatches.map((m) => {
            const opp = m.opportunity;
            const isAct = m.decision === 'ACT';

            return (
              <Link
                key={m.id}
                href={`/opportunities/${m.opportunity_id}`}
                className="p-4 border-[1.5px] border-border rounded-[14px] bg-white shadow-hard text-foreground no-underline flex flex-col justify-between gap-3 hover:translate-x-0.5 hover:translate-y-0.5 transition-all group"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                      {opp?.type || 'OPPORTUNITY'}
                    </span>
                    <span
                      className={`px-2 py-0.5 border-[1.5px] border-border rounded-full font-mono text-[10px] font-semibold ${
                        isAct ? 'bg-act text-accent-text' : 'bg-ask text-ask-foreground'
                      }`}
                    >
                      {m.decision}
                    </span>
                  </div>

                  <span className="font-display font-extrabold text-4xl leading-none text-foreground tracking-tight">
                    {m.match_score ?? '—'}
                  </span>

                  <div className="flex flex-col">
                    <h3 className="font-display font-bold text-base text-foreground leading-snug group-hover:text-accent-text transition-colors line-clamp-2 m-0">
                      {opp?.title || 'Opportunity'}
                    </h3>
                    <span className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {opp?.organization || 'Official listing'}
                    </span>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-line text-xs text-ink-2 line-clamp-2">
                  {m.explanation || 'Verified against confirmed skills and graduation criteria.'}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
