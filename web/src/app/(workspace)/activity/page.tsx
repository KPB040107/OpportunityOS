import { Activity as ActivityIcon, CheckCircle2, AlertCircle, Cpu, Clock, ShieldCheck } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { LiveUpdates } from '@/components/live-updates';
import type { Activity, AgentRun } from '@/lib/types';

export default async function ActivityPage() {
  const { supabase, user } = await requireUser();

  const [eventsResult, heartbeatResult] = await Promise.all([
    supabase
      .from('events')
      .select('id,stage,level,message,ts,metadata')
      .eq('user_id', user.id)
      .order('ts', { ascending: false })
      .limit(100),
    supabase
      .from('agent_runs')
      .select('*')
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .order('ts', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (eventsResult.error) throw new Error('Activity unavailable');

  const rows = (eventsResult.data || []) as Activity[];
  const heartbeat = heartbeatResult.data as AgentRun | null;

  const isHealthy = heartbeat ? heartbeat.status === 'ok' : true;

  return (
    <div className="space-y-6">
      <LiveUpdates userId={user.id} />

      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Live Operations</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">System Activity & Agent Status</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Autonomous operations log and agent heartbeat. Times shown in Asia/Kolkata.
        </p>
      </div>

      {/* Agent Heartbeat Header Strip (Guide Section 10) */}
      <Card className="p-4 bg-muted/30 border-primary/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex size-10 items-center justify-center rounded-xl ${
                isHealthy ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
              }`}
            >
              <Cpu className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Agent Heartbeat
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    isHealthy
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-red-50 text-red-800'
                  }`}
                >
                  <span className="size-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  {heartbeat ? (isHealthy ? 'Autopilot Active' : 'Degraded') : 'Autopilot Ready'}
                </span>
              </div>
              <p className="text-sm font-semibold">
                Workflow: {heartbeat?.workflow || 'OpportunityOS 06 Autopilot'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Clock className="size-3.5 text-muted-foreground" />
              <span>
                Last Scan: {heartbeat?.ts ? formatDate(heartbeat.ts) : 'Just started'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-primary" />
              <span>
                Next Run: {heartbeat?.next_run_at ? formatDate(heartbeat.next_run_at) : 'Scheduled daily (09:00 IST)'}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Events Timeline */}
      <Card>
        {!rows.length ? (
          <div className="py-10 text-center">
            <ActivityIcon className="mx-auto mb-4 size-8 text-primary/60" />
            <h2 className="font-semibold">Your story starts here</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Profile saves, confirmed opportunity submissions, and background autopilot runs will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((event) => (
              <li key={event.id} className="flex gap-4 p-5 first:pt-5 last:pb-5">
                <div
                  className={`mt-1 flex size-8 shrink-0 items-center justify-center rounded-full ${
                    event.level === 'error'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {event.level === 'error' ? (
                    <AlertCircle className="size-4" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{event.message}</p>
                  <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                    {event.stage} · {event.level}
                  </p>
                </div>
                <time dateTime={event.ts} className="text-right text-xs text-muted-foreground whitespace-nowrap">
                  {formatDate(event.ts)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
