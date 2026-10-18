import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { StatusSelect } from './status-select';
import { formatDate } from '@/lib/utils';
import { deadlineLabel } from '@/lib/analysis';
import {
  ArrowUpRight,
  Calendar,
  Clock,
  Briefcase,
  FileText,
  UserCheck,
  Send,
  Award,
  Archive,
  ChevronRight,
  type LucideIcon
} from 'lucide-react';
import type { Application, ApplicationStatus } from '@/lib/types';
import { LiveUpdates } from '@/components/live-updates';

export const STAGE_CONFIG: Array<{
  id: ApplicationStatus;
  label: string;
  shortLabel: string;
  color: string;
  badgeColor: string;
  icon: LucideIcon;
}> = [
  { id: 'saved', label: 'Saved for later', shortLabel: 'Saved', color: 'border-border bg-white', badgeColor: 'bg-skip text-foreground border-border', icon: Clock },
  { id: 'to_apply', label: 'To Apply (Priority Queue)', shortLabel: 'To Apply', color: 'border-border bg-act', badgeColor: 'bg-primary text-foreground border-border', icon: Send },
  { id: 'applied', label: 'Applied', shortLabel: 'Applied', color: 'border-border bg-skip', badgeColor: 'bg-white text-foreground border-border', icon: Briefcase },
  { id: 'assessment', label: 'Assessment / Online Test', shortLabel: 'Assessment', color: 'border-border bg-ask', badgeColor: 'bg-ask text-ask-foreground border-border', icon: FileText },
  { id: 'interview', label: 'Interviewing', shortLabel: 'Interview', color: 'border-border bg-ask', badgeColor: 'bg-white text-foreground border-border', icon: UserCheck },
  { id: 'offer', label: 'Offer Received', shortLabel: 'Offer', color: 'border-border bg-act', badgeColor: 'bg-primary text-foreground border-border', icon: Award },
  { id: 'rejected', label: 'Archived / Rejected', shortLabel: 'Archived', color: 'border-border bg-background', badgeColor: 'bg-skip text-muted-foreground border-border', icon: Archive }
];

export interface ApplicationsPageProps {
  searchParams?: Promise<{
    stage?: string;
  }>;
}

export default async function ApplicationsPage({ searchParams }: ApplicationsPageProps = {}) {
  const { supabase, user } = await requireUser();
  const params = searchParams ? await searchParams : {};
  const activeStage = params.stage || 'all';

  const { data: appsData, error } = await supabase
    .from('applications')
    .select(`
      id,
      user_id,
      opportunity_id,
      status,
      notes,
      created_at,
      updated_at,
      opportunity:opportunities(id, title, organization, deadline, application_url, location, type)
    `)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error('Applications tracker data unavailable');
  }

  const applications = (appsData || []) as unknown as Application[];

  // Stage counts for the progress pipeline
  const stageCounts: Record<ApplicationStatus, number> = {
    saved: 0,
    to_apply: 0,
    applied: 0,
    assessment: 0,
    interview: 0,
    offer: 0,
    rejected: 0
  };

  for (const app of applications) {
    const st = app.status as ApplicationStatus;
    if (stageCounts[st] !== undefined) {
      stageCounts[st]++;
    }
  }

  // Filtered applications based on activeStage tab
  const displayedApplications = activeStage === 'all'
    ? applications
    : applications.filter(a => a.status === activeStage);

  return (
    <div className="space-y-6">
      <LiveUpdates userId={user.id} />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Applications Stage Tracker</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track your progress through all 7 recruitment stages: Saved, To Apply, Applied, Assessment, Interview, Offer, and Archived.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-primary/10 text-primary">
            {applications.length} Total Pursuits
          </span>
        </div>
      </div>

      {/* 7-Stage Pipeline Visual Tracker (X-03) */}
      <Card className="p-4 overflow-x-auto">
        <div className="flex items-center justify-between min-w-[700px] gap-2">
          {STAGE_CONFIG.map((stage, idx) => {
            const count = stageCounts[stage.id] || 0;
            const isSelected = activeStage === stage.id;
            const Icon = stage.icon;
            return (
              <div key={stage.id} className="flex-1 flex items-center">
                <Link
                  href={isSelected ? '/applications' : `/applications?stage=${stage.id}`}
                  className={`w-full p-2.5 rounded-lg border text-center transition-all ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <Icon className="size-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-foreground">{stage.shortLabel}</span>
                  </div>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
                      count > 0 ? stage.badgeColor : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {count}
                  </span>
                </Link>
                {idx < STAGE_CONFIG.length - 1 && (
                  <ChevronRight className="size-4 text-muted-foreground/40 shrink-0 mx-1" />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <Link
          href="/applications"
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            activeStage === 'all'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          All Stages ({applications.length})
        </Link>
        {STAGE_CONFIG.map((st) => (
          <Link
            key={st.id}
            href={`/applications?stage=${st.id}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeStage === st.id
                ? 'bg-primary text-white shadow-sm'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {st.shortLabel} ({stageCounts[st.id] || 0})
          </Link>
        ))}
      </div>

      {/* Application Cards List */}
      {displayedApplications.length === 0 ? (
        <Card className="p-10 text-center">
          <Clock className="mx-auto size-10 text-muted-foreground/60" />
          <h2 className="mt-4 text-base font-semibold">
            {activeStage === 'all'
              ? 'No applications tracked yet'
              : `No applications currently in '${activeStage.replace('_', ' ')}'`}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            {activeStage === 'all'
              ? 'When OpportunityOS finds an eligible strong match (ACT) or when you approve an opportunity in the Approval Center, it will appear here automatically.'
              : 'You can move any opportunity into this stage using the stage dropdown selector on its card.'}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            {activeStage !== 'all' && (
              <Link
                href="/applications"
                className="inline-flex items-center rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
              >
                View all stages
              </Link>
            )}
            <Link
              href="/opportunities"
              className="inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
            >
              Discover Opportunities
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {displayedApplications.map((app) => {
            const opp = app.opportunity;
            const currentStageConfig = STAGE_CONFIG.find(c => c.id === app.status) || STAGE_CONFIG[0];
            const StageIcon = currentStageConfig.icon;

            return (
              <Card key={app.id} className="p-5 flex flex-col justify-between transition-shadow hover:shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                        {opp?.type || 'Opportunity'}
                      </span>
                      {opp?.location && (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                          {opp.location}
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${currentStageConfig.badgeColor}`}>
                        <StageIcon className="size-3" />
                        {currentStageConfig.shortLabel}
                      </span>
                    </div>

                    <h2 className="text-lg font-semibold leading-snug">
                      {opp?.id ? (
                        <Link href={`/opportunities/${opp.id}`} className="hover:text-primary transition-colors">
                          {opp.title || 'Untitled Opportunity'}
                        </Link>
                      ) : (
                        opp?.title || 'Untitled Opportunity'
                      )}
                    </h2>
                    <p className="text-sm font-medium text-foreground">
                      {opp?.organization || 'Unknown Organisation'}
                    </p>
                  </div>

                  <div className="flex flex-col sm:items-end gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Stage:</span>
                      <StatusSelect id={app.id} currentStatus={app.status as ApplicationStatus} />
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Updated {formatDate(app.updated_at)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-4">
                    <span className="inline-flex items-center gap-1 font-medium text-foreground">
                      <Calendar className="size-3.5 text-muted-foreground" />
                      Deadline: {deadlineLabel(opp?.deadline || null)}
                    </span>
                    {app.notes && (
                      <span className="text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-border">
                        Note: {app.notes}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {opp?.id && (
                      <Link
                        href={`/opportunities/${opp.id}`}
                        className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                      >
                        Inspect Opportunity
                      </Link>
                    )}
                    {opp?.application_url && (
                      <a
                        href={opp.application_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                      >
                        Apply on Employer Site
                        <ArrowUpRight className="size-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
