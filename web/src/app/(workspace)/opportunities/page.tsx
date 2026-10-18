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
    sort?: string;
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

function buildFilterHref(currentParams: Record<string, string | undefined>, updates: Record<string, string | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(currentParams)) {
    if (v && v !== 'all') q.set(k, v);
  }
  for (const [k, v] of Object.entries(updates)) {
    if (v === null || v === undefined || v === 'all') q.delete(k);
    else q.set(k, v);
  }
  q.delete('page');
  const s = q.toString();
  return s ? `/opportunities?${s}` : '/opportunities';
}

export default async function OpportunitiesPage({ searchParams }: OpportunitiesPageProps = {}) {
  const { supabase, user } = await requireUser();
  const params = searchParams ? await searchParams : {};

  // Stable pagination: default 20 records per page; cap requests at 50
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  const requestedLimit = parseInt(params.limit || '20', 10) || 20;
  const limit = Math.min(50, Math.max(1, requestedLimit));
  const from = (page - 1) * limit;

  const [rawItemsRes, profileRes, counterRes, catalogRes, appsRes] = await Promise.all([
    supabase.from('raw_items').select('id,source_type,raw_content,status,error_code,created_at,is_opportunity,duplicate_of,retry_count,metadata')
      .eq('user_id',user.id).neq('source_type','discovery').order('created_at',{ascending:false}).limit(10),
    supabase.from('profiles').select('display_name,autonomy_mode,branch,interest_types').eq('user_id',user.id).maybeSingle(),
    supabase.rpc('get_home_counter'),
    supabase.rpc('get_opportunities_page',{p_filters:params,p_limit:limit,p_offset:from}),
    supabase.from('applications').select('opportunity_id, status').eq('user_id', user.id)
  ]);
  if (rawItemsRes.error || profileRes.error || catalogRes.error || counterRes.error) throw new Error('Opportunities data unavailable. Please retry.');
  const catalog = catalogRes.data as {items:FeedOpportunity[];total:number;employers:string[]};
  let feedOpportunities = catalog.items || [];
  const totalCount = catalog.total;
  const distinctEmployers = catalog.employers;

  // Build application status map for each opportunity
  const applicationStatuses: Record<string, string> = {};
  for (const app of (appsRes.data || [])) {
    if (app.opportunity_id) {
      applicationStatuses[app.opportunity_id] = app.status;
    }
  }

  // Server-side sorting handling
  if (params.sort === 'deadline') {
    feedOpportunities = [...feedOpportunities].sort((a, b) => {
      if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      if (a.deadline && !b.deadline) return -1;
      if (!a.deadline && b.deadline) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  } else if (params.sort === 'newest') {
    feedOpportunities = [...feedOpportunities].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // Enforce diversity caps: max 3 items per employer on first page
  if (page === 1 && (!params.employer || params.employer === 'all') && params.sort !== 'newest') {
    const employerCounts: Record<string, number> = {};
    const topTier: FeedOpportunity[] = [];
    const deferred: FeedOpportunity[] = [];
    for (const item of feedOpportunities) {
      const emp = (item.organization || 'unknown').toLowerCase();
      const count = employerCounts[emp] || 0;
      if (count < 3 || topTier.length >= 12) {
        topTier.push(item);
        employerCounts[emp] = count + 1;
      } else {
        deferred.push(item);
      }
    }
    feedOpportunities = [...topTier, ...deferred];
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

  return (
    <>
      <LiveUpdates userId={user.id} />
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Discovered Possibilities</p>
          <h1 className="mt-2 text-3xl font-semibold">{name ? `${name}’s Opportunities` : 'Opportunities Catalog'}</h1>
          <p className="mt-3 text-muted-foreground">
            Search, filter, and track openings across company feeds, hackathons, and captured alerts.
          </p>
        </div>
        <span className="rounded-full border border-border bg-white px-4 py-2 text-xs text-muted-foreground">
          {profile?.autonomy_mode || 'balanced'} mode · Asia/Kolkata
        </span>
      </div>

      <AutonomyCounter data={counterData} />

      {!profile && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 border-border bg-act/30 shadow-hard">
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

      {/* 3 Top-Level Filter Tabs (X-01) */}
      <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <Link
          href={buildFilterHref(params, { type: null })}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            !params.type || params.type === 'all'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          All Possibilities
        </Link>
        <Link
          href={buildFilterHref(params, { type: 'internship' })}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            params.type === 'internship'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          🎓 Internships
        </Link>
        <Link
          href={buildFilterHref(params, { type: 'job' })}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            params.type === 'job'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          💼 Jobs
        </Link>
        <Link
          href={buildFilterHref(params, { type: 'hackathon' })}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            params.type === 'hackathon'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          ⚡ Hackathons
        </Link>
      </div>

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
            Ranked using your profile. Check each listing’s eligibility and source details. Use the filters below to refine by type, trust tier, or deadline.
          </p>
        </div>

        <InboxFeed
          key={JSON.stringify(params)}
          serverFiltered
          initialOpportunities={feedOpportunities}
          totalCount={totalCount}
          currentPage={page}
          pageSize={limit}
          allEmployers={distinctEmployers}
          currentParams={params}
          autonomyMode={profile?.autonomy_mode || 'balanced'}
          applicationStatuses={applicationStatuses}
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
                      <Globe className="size-3.5 text-primary" />
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
                      ? 'Captured page — unverified source'
                      : 'Pasted announcement'}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                      item.status === 'failed' ? 'bg-danger text-danger-foreground border border-border' : 'bg-act text-act-foreground border border-border'
                    }`}
                  >
                    {item.source_type === 'capture' && item.status === 'queued'
                      ? 'Captured page — awaiting analysis'
                      : item.status}
                  </span>
                </div>
                <p className="line-clamp-2 text-foreground font-mono text-[11px] mb-2 bg-muted/30 p-1.5 rounded">
                  {item.source_type === 'capture' && item.metadata && typeof item.metadata.title === 'string'
                    ? `${item.metadata.title} — ${item.raw_content}`
                    : item.raw_content}
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
