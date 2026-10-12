import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { StatusSelect } from './status-select';
import { formatDate } from '@/lib/utils';
import { deadlineLabel } from '@/lib/analysis';
import { ArrowUpRight, Calendar, Clock } from 'lucide-react';
import type { Application, ApplicationStatus } from '@/lib/types';

export default async function ApplicationsPage() {
  const { supabase, user } = await requireUser();

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Applications Tracker</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Autonomous pipeline for opportunities you are pursuing. Verified matches (ACT) and approved requests are tracked here automatically.
        </p>
      </div>

      {applications.length === 0 ? (
        <Card className="p-10 text-center">
          <Clock className="mx-auto size-10 text-muted-foreground/60" />
          <h2 className="mt-4 text-base font-semibold">No applications tracked yet</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            When OpportunityOS finds an eligible strong match (ACT) or when you approve an opportunity in the Approval Center, it will appear here automatically.
          </p>
          <div className="mt-6">
            <Link
              href="/inbox"
              className="inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
            >
              Go to Opportunity Inbox
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {applications.map((app) => {
            const opp = app.opportunity;
            return (
              <Card key={app.id} className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {opp?.type || 'Opportunity'}
                      </span>
                      {opp?.location && (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                          {opp.location}
                        </span>
                      )}
                    </div>
                    <h2 className="text-lg font-semibold">
                      {opp?.id ? (
                        <Link href={`/opportunities/${opp.id}`} className="hover:text-primary transition-colors">
                          {opp.title || 'Untitled Opportunity'}
                        </Link>
                      ) : (
                        opp?.title || 'Untitled Opportunity'
                      )}
                    </h2>
                    <p className="text-sm text-muted-foreground">{opp?.organization || 'Unknown Organisation'}</p>
                  </div>
                  <div className="flex flex-col sm:items-end gap-2">
                    <StatusSelect id={app.id} currentStatus={app.status as ApplicationStatus} />
                    <span className="text-xs text-muted-foreground">
                      Updated {formatDate(app.updated_at)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-4">
                    <span className="inline-flex items-center gap-1 font-medium text-foreground">
                      <Calendar className="size-3.5 text-muted-foreground" />
                      Deadline: {deadlineLabel(opp?.deadline || null)}
                    </span>
                    {app.notes && <span>Note: {app.notes}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    {opp?.id && (
                      <Link
                        href={`/opportunities/${opp.id}`}
                        className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                      >
                        View Decision Breakdown
                      </Link>
                    )}
                    {opp?.application_url && (
                      <a
                        href={opp.application_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                      >
                        Open Application Page
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
