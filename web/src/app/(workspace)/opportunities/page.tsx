import Link from 'next/link';
import { Inbox, FileText, Link2, ArrowUpRight, Globe } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LiveUpdates } from '@/components/live-updates';
import { IntakeForm } from '../inbox/intake-form';
import type { RawItem } from '@/lib/types';
import { errorMessages } from '@/lib/analysis';
import { RetryForm } from '../inbox/retry-form';
import { AutonomyCounter, type HomeCounterData } from '@/components/autonomy-counter';
import { InboxFeed, type FeedOpportunity } from '../inbox/inbox-feed';

export interface OpportunitiesPageProps {
  searchParams?: Promise<{
    page?: string;
    limit?: string;
    q?: string;
    type?: string;
    employer?: string;
    trust?: string;
    deadline?: string;
    location?: string;
    eligibility?: string;
    decision?: string;
    saved?: string;
    hidden?: string;
    view?: string;
    field?: string;
  }>;
}

export default async function OpportunitiesPage({ searchParams }: OpportunitiesPageProps = {}) {
  const { supabase, user } = await requireUser();
  const params = searchParams ? await searchParams : {};

  // Stable pagination: default 20 records per page; cap requests at 50
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  const requestedLimit = parseInt(params.limit || '20', 10) || 20;
  const limit = Math.min(50, Math.max(1, requestedLimit));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Build owner-scoped indexed opportunities query
  let oppsQuery = supabase
    .from('opportunities')
    .select(
      'id, title, organization, type, location, deadline, application_url, skills, ambiguity_flags, trust_tier, source_badge, risk_signals, seniority_level, created_at',
      { count: 'exact' }
    )
    .eq('user_id', user.id);

  if (params.type && params.type !== 'all') {
    oppsQuery = oppsQuery.eq('type', params.type);
  }
  if (params.employer && params.employer !== 'all') {
    oppsQuery = oppsQuery.ilike('organization', params.employer);
  }
  if (params.trust && params.trust !== 'all') {
    oppsQuery = oppsQuery.eq('trust_tier', params.trust.toLowerCase());
  }
  if (params.deadline === 'unknown') {
    oppsQuery = oppsQuery.is('deadline', null);
  } else if (params.deadline === 'upcoming') {
    const today = new Date().toISOString().slice(0, 10);
    oppsQuery = oppsQuery.gte('deadline', today);
  }
  if (params.location === 'remote') {
    oppsQuery = oppsQuery.ilike('location', '%remote%');
  } else if (params.location === 'onsite') {
    oppsQuery = oppsQuery.not('location', 'ilike', '%remote%');
  }
  if (params.q && params.q.trim()) {
    const q = params.q.trim();
    oppsQuery = oppsQuery.or(`title.ilike.%${q}%,organization.ilike.%${q}%`);
  }

  // Handle saved-only server filtering
  if (params.saved === 'true') {
    const { data: savedData } = await supabase
      .from('user_opportunity_interactions')
      .select('opportunity_id')
      .eq('user_id', user.id)
      .eq('is_saved', true);
    const savedIds = (savedData || []).map((i) => i.opportunity_id);
    oppsQuery = oppsQuery.in('id', savedIds.length > 0 ? savedIds : ['00000000-0000-0000-0000-000000000000']);
  }

  // Handle hidden exclusion unless explicitly requested
  if (params.hidden !== 'true') {
    const { data: hiddenData } = await supabase
      .from('user_opportunity_interactions')
      .select('opportunity_id')
      .eq('user_id', user.id)
      .eq('is_hidden', true);
    const hiddenIds = (hiddenData || []).map((i) => i.opportunity_id);
    if (hiddenIds.length > 0) {
      oppsQuery = oppsQuery.not('id', 'in', `(${hiddenIds.join(',')})`);
    }
  }

  // Order chronologically and paginate with bounded range
  oppsQuery = oppsQuery
    .order('created_at', { ascending: false })
    .range(from, to);

  const [rawItemsRes, profileRes, counterRes, oppsRes, sourcePrefsRes, allEmployersRes] =
    await Promise.all([
      // 1. Raw submissions
      supabase
        .from('raw_items')
        .select('id,source_type,raw_content,status,error_code,created_at,is_opportunity,duplicate_of,retry_count')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30),

      // 2. Profile
      supabase
        .from('profiles')
        .select('display_name,autonomy_mode,branch,interest_types')
        .eq('user_id', user.id)
        .maybeSingle(),

      // 3. Counter
      supabase.rpc('get_home_counter'),

      // 4. Bounded opportunities page read
      oppsQuery,

      // 5. Source preferences (muted / normal)
      supabase
        .from('user_source_preferences')
        .select('source_identifier, preference')
        .eq('user_id', user.id),

      // 6. Distinct employers for filter dropdown
      supabase
        .from('opportunities')
        .select('organization')
        .eq('user_id', user.id)
        .limit(200)
    ]);

  if (rawItemsRes.error || profileRes.error || oppsRes.error) {
    throw new Error('Opportunities catalog data unavailable');
  }

  const rawItems = rawItemsRes.data as RawItem[];
  const profile = profileRes.data;
  const name = profile?.display_name?.split(' ')[0];

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

  const totalCount = oppsRes.count ?? (oppsRes.data || []).length;
  const oppIds = (oppsRes.data || []).map((o) => o.id);

  // Fetch matches and interactions ONLY for the bounded opportunities on this page
  const [matchesRes, interactionsRes] = oppIds.length > 0 ? await Promise.all([
    supabase
      .from('matches')
      .select('id, opportunity_id, decision, eligibility_status, match_score, confidence, explanation, reason_codes')
      .eq('user_id', user.id)
      .in('opportunity_id', oppIds),
    supabase
      .from('user_opportunity_interactions')
      .select('opportunity_id, is_saved, is_hidden')
      .eq('user_id', user.id)
      .in('opportunity_id', oppIds)
  ]) : [{ data: [] }, { data: [] }];

  const matchesMap = new Map((matchesRes.data || []).map((m) => [m.opportunity_id, m]));
  const interactionsMap = new Map((interactionsRes.data || []).map((i) => [i.opportunity_id, i]));
  const sourcePrefs = Object.fromEntries(
    (sourcePrefsRes.data || []).map((p) => [p.source_identifier.toLowerCase(), p.preference])
  );

  const distinctEmployers = Array.from(
    new Set((allEmployersRes.data || []).map((o) => o.organization).filter(Boolean))
  ).sort() as string[];

  type RawOpportunityRecord = {
    id: string;
    title: string;
    organization: string;
    type: string;
    location: string | null;
    deadline: string | null;
    application_url: string | null;
    skills: string[] | null;
    ambiguity_flags: string[] | null;
    trust_tier: string;
    source_badge: string | null;
    risk_signals: string[] | null;
    seniority_level: string | null;
    created_at: string;
  };

  const feedOpportunities: FeedOpportunity[] = ((oppsRes.data || []) as unknown as RawOpportunityRecord[]).map((o) => {
    const m = matchesMap.get(o.id);
    const inter = interactionsMap.get(o.id);
    return {
      id: o.id,
      title: o.title,
      organization: o.organization,
      type: o.type,
      location: o.location,
      deadline: o.deadline,
      application_url: o.application_url,
      skills: o.skills || [],
      ambiguity_flags: o.ambiguity_flags || [],
      trust_tier: o.trust_tier,
      source_badge: o.source_badge,
      risk_signals: o.risk_signals || [],
      seniority_level: o.seniority_level || 'uncertain',
      created_at: o.created_at,
      is_saved: inter?.is_saved ?? false,
      is_hidden: inter?.is_hidden ?? false,
      match: m
        ? {
            id: m.id,
            decision: m.decision,
            eligibility_status: m.eligibility_status,
            match_score: m.match_score,
            confidence: m.confidence,
            explanation: m.explanation,
            reason_codes: m.reason_codes
          }
        : undefined
    };
  });

  return (
    <>
      <LiveUpdates userId={user.id} />
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Discovered Possibilities</p>
          <h1 className="mt-2 text-3xl font-semibold">{name ? `${name}’s Opportunities` : 'Opportunities Catalog'}</h1>
          <p className="mt-3 text-muted-foreground">
            Search, filter, and track verified openings across company feeds, hackathons, and captured alerts.
          </p>
        </div>
        <span className="rounded-full border border-border bg-white px-4 py-2 text-xs text-muted-foreground">
          {profile?.autonomy_mode || 'balanced'} mode · Asia/Kolkata
        </span>
      </div>

      <AutonomyCounter data={counterData} />

      {!profile && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 border-emerald-200 bg-emerald-50">
          <div>
            <h2 className="font-semibold">Start with your profile</h2>
            <p className="mt-1 text-sm text-muted-foreground">Add your academic details, skills, and interests.</p>
          </div>
          <Button asChild size="sm">
            <Link href="/profile">
              Complete profile
              <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        </Card>
      )}

      {/* Intake Announcement Form */}
      <Card className="mb-8">
        <div className="mb-5">
          <h2 className="text-xl font-semibold">Found something interesting?</h2>
          <p className="mt-2 text-sm text-muted-foreground">Save the announcement or its website link.</p>
        </div>
        <IntakeForm />
      </Card>

      {/* Interactive Curated Opportunities Catalog Feed */}
      <section className="mb-12">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">All Discovered Opportunities</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Curated, ranked, and verified against your profile. Use the filters below to refine by type, trust tier, or deadline.
          </p>
        </div>

        <InboxFeed
          initialOpportunities={feedOpportunities}
          totalCount={totalCount}
          currentPage={page}
          pageSize={limit}
          allEmployers={distinctEmployers}
          currentParams={params}
          autonomyMode={profile?.autonomy_mode || 'balanced'}
          userSourcePreferences={sourcePrefs}
          profileBranch={profile?.branch || null}
        />
      </section>

      {/* Direct Submissions & Raw Ingest Log */}
      <section className="pt-8 border-t border-border">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your Submissions & Alert History</h2>
          <span className="text-xs text-muted-foreground">{rawItems.length} submissions</span>
        </div>
        <p className="mb-5 text-xs text-muted-foreground">
          Track analysis status for pasted announcements, website links, forwarded alert emails, and captured browser tabs.
        </p>

        {!rawItems.length ? (
          <Card className="py-8 text-center bg-muted/20">
            <Inbox className="mx-auto mb-3 size-7 text-primary/60" />
            <p className="text-xs text-muted-foreground">No manual submissions yet.</p>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {rawItems.map((item) => (
              <Card key={item.id} className="p-4 text-xs">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
                    {item.source_type === 'url' ? (
                      <Link2 className="size-3.5" />
                    ) : item.source_type === 'discovery' ? (
                      <Globe className="size-3.5 text-emerald-600" />
                    ) : item.source_type === 'capture' ? (
                      <Globe className="size-3.5 text-blue-600" />
                    ) : (
                      <FileText className="size-3.5" />
                    )}
                    {item.source_type === 'url'
                      ? 'Website link'
                      : item.source_type === 'email'
                      ? 'Forwarded email'
                      : item.source_type === 'discovery'
                      ? 'Autonomous feed'
                      : item.source_type === 'capture'
                      ? 'Captured page'
                      : 'Pasted announcement'}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                      item.status === 'failed' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-primary'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="line-clamp-2 text-foreground font-mono text-[11px] mb-2 bg-muted/30 p-1.5 rounded">
                  {item.raw_content}
                </p>
                {item.error_code && (
                  <p className="text-red-700 font-medium mb-2">
                    {errorMessages[item.error_code] || 'Analysis needs attention.'}
                  </p>
                )}
                {item.status === 'failed' && !item.duplicate_of && item.retry_count < 2 && (
                  <RetryForm id={item.id} />
                )}
                <span className="text-[10px] text-muted-foreground">Saved {formatDate(item.created_at)}</span>
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
