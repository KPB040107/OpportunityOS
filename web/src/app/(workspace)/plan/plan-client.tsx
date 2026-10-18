'use client';

import { useState, useTransition } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Settings,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Plus,
  Trash2,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type {
  UserAvailability,
  WeeklyPlanResult,
  OpportunityCandidate,
  WorkingWindow,
  BusyBlock,
  PlannedTask,
  PlanRecord,
  ScheduledTaskItem,
} from '@/lib/planner';

interface PlanClientProps {
  initialAvailability: UserAvailability;
  initialPlan: PlanRecord | null;
  initialTasks: PlannedTask[];
  candidates: OpportunityCandidate[];
}

const DAYS_OF_WEEK = [
  { index: 1, name: 'Monday' },
  { index: 2, name: 'Tuesday' },
  { index: 3, name: 'Wednesday' },
  { index: 4, name: 'Thursday' },
  { index: 5, name: 'Friday' },
  { index: 6, name: 'Saturday' },
  { index: 0, name: 'Sunday' },
];

export function PlanClient({
  initialAvailability,
  initialPlan,
  initialTasks,
  candidates,
}: PlanClientProps) {
  const [availability, setAvailability] = useState<UserAvailability>(initialAvailability);
  const [activePlan, setActivePlan] = useState<PlanRecord | null>(initialPlan);
  const [planDraft, setPlanDraft] = useState<WeeklyPlanResult | null>(
    initialPlan?.status === 'draft' ? initialPlan : null
  );
  const [plannedTasks, setPlannedTasks] = useState<PlannedTask[]>(initialTasks);
  const [showAvailSettings, setShowAvailSettings] = useState(false);

  // Availability form state
  const [budgetHours, setBudgetHours] = useState<number>(availability.weekly_budget_hours || 10);
  const [workingWindows, setWorkingWindows] = useState<WorkingWindow[]>(
    availability.working_windows || []
  );
  const [busyBlocks, setBusyBlocks] = useState<BusyBlock[]>(availability.busy_blocks || []);
  const [newBusyTitle, setNewBusyTitle] = useState('');
  const [newBusyStart, setNewBusyStart] = useState('');
  const [newBusyEnd, setNewBusyEnd] = useState('');

  // Priority and estimate overrides
  const [priorities, setPriorities] = useState<Record<string, 'high' | 'normal' | 'low'>>({});
  const [estimates, setEstimates] = useState<Record<string, number>>({});

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Helper to format hours:mins
  const scheduledMinutes = planDraft?.total_scheduled_minutes ?? (plannedTasks.length * 30);
  const scheduledHours = (scheduledMinutes / 60).toFixed(1);
  const budgetTotalHours = (availability.weekly_budget_hours || 10).toFixed(1);
  const percentUsed = Math.min(100, Math.round((scheduledMinutes / (budgetHours * 60)) * 100));

  async function handleSaveAvailability() {
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/plan/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekly_budget_hours: Number(budgetHours),
          working_windows: workingWindows,
          busy_blocks: busyBlocks,
          timezone: availability.timezone,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to save availability.');
      }

      setAvailability((prev) => ({
        ...prev,
        weekly_budget_hours: Number(budgetHours),
        working_windows: workingWindows,
        busy_blocks: busyBlocks,
        revision: data.availability?.revision || prev.revision + 1,
      }));

      setSuccess('Availability and capacity budget updated successfully!');
      setShowAvailSettings(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update availability.');
    }
  }

  function handleGeneratePlan() {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const res = await fetch('/api/plan/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            weekStart: new Date().toISOString().slice(0, 10),
            customEstimates: estimates,
            priorities: priorities,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || data.error || 'Failed to calculate weekly plan.');
        }

        setPlanDraft(data.plan);
        setActivePlan({ id: data.plan_id, status: 'draft', ...data.plan });
        setSuccess('Deterministic weekly plan calculated! Review your schedule and click Confirm below.');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to calculate plan.');
      }
    });
  }

  function handleConfirmPlan() {
    const planId = activePlan?.id;
    if (!planId) return;

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const res = await fetch('/api/plan/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan_id: planId,
            expected_availability_revision: availability.revision,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || data.error || 'Failed to confirm plan.');
        }

        setActivePlan((prev) => (prev ? { ...prev, status: 'confirmed' } : null));
        setPlannedTasks((planDraft?.scheduled_items || []) as unknown as PlannedTask[]);
        setSuccess(`Weekly plan confirmed! ${data.data?.tasks_created ?? planDraft?.scheduled_items.length} tasks scheduled into your calendar.`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Confirmation failed.');
      }
    });
  }

  // Display items: either confirmed tasks or draft scheduled items
  const displayItems: (PlannedTask | ScheduledTaskItem)[] = activePlan?.status === 'confirmed' && plannedTasks.length > 0
    ? plannedTasks
    : (planDraft?.scheduled_items || []);

  const unscheduledItems = planDraft?.unscheduled_items || [];
  const pressureNotes = planDraft?.pressure_notes || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <CalendarIcon className="size-4" />
            </span>
            <h1 className="text-3xl font-semibold text-foreground">Weekly Plan</h1>
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              Slice S6 Deterministic
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manageable weekly priorities calculated from confirmed deadlines and manual availability. Zero AI calls.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAvailSettings(!showAvailSettings)}
          >
            <Settings className="mr-1.5 size-4" />
            Availability &amp; Budget
            {showAvailSettings ? <ChevronUp className="ml-1 size-3.5" /> : <ChevronDown className="ml-1 size-3.5" />}
          </Button>

          <Button
            variant="default"
            size="sm"
            disabled={isPending}
            onClick={handleGeneratePlan}
          >
            <RefreshCw className={`mr-1.5 size-4 ${isPending ? 'animate-spin' : ''}`} />
            Calculate Week Plan
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 p-4 text-sm text-primary">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Capacity & Progress Bar */}
      <Card className="border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Clock className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Weekly Effort Allocation</p>
              <p className="text-xs text-muted-foreground">
                {scheduledHours} hours allocated of {budgetTotalHours} hours weekly budget ({percentUsed}% capacity)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activePlan?.status === 'confirmed' ? (
              <span className="flex items-center gap-1.5 rounded-full bg-act px-3 py-1 text-xs font-semibold text-act-foreground border border-border">
                <CheckCircle2 className="size-3.5" />
                Plan Confirmed
              </span>
            ) : (
              <span className="rounded-full bg-ask px-3 py-1 text-xs font-semibold text-ask-foreground border border-border">
                Draft Preview
              </span>
            )}

            {planDraft && activePlan?.status === 'draft' && (
              <Button size="sm" onClick={handleConfirmPlan} disabled={isPending}>
                Confirm This Week&apos;s Plan
                <ArrowRight className="ml-1.5 size-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all duration-500 ${
              percentUsed > 90 ? 'bg-primary' : 'bg-primary/80'
            }`}
            style={{ width: `${percentUsed}%` }}
          />
        </div>
      </Card>

      {/* Availability Settings Drawer */}
      {showAvailSettings && (
        <Card className="border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Availability &amp; Effort Capacity</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure your available study/work windows and add exam or busy blocks so tasks are never placed during conflicts.
          </p>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {/* Left: Working Windows & Budget */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Weekly Effort Budget (Hours)
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    step={0.5}
                    value={budgetHours}
                    onChange={(e) => setBudgetHours(parseFloat(e.target.value) || 1)}
                    className="w-32"
                  />
                  <span className="text-xs text-muted-foreground">hours/week max</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Working Windows by Day (30-min block slots)
                </label>
                <div className="mt-2 space-y-2">
                  {DAYS_OF_WEEK.map((d) => {
                    const win = workingWindows.find((w) => w.day === d.index);
                    const isEnabled = !!win;
                    return (
                      <div key={d.index} className="flex items-center justify-between rounded-lg border border-border/70 p-2.5">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setWorkingWindows([...workingWindows, { day: d.index, start: '09:00', end: '12:00' }]);
                              } else {
                                setWorkingWindows(workingWindows.filter((w) => w.day !== d.index));
                              }
                            }}
                            className="rounded border-border text-primary"
                          />
                          <span className="text-sm font-medium text-foreground">{d.name}</span>
                        </label>

                        {isEnabled && (
                          <div className="flex items-center gap-2 text-xs">
                            <Input
                              type="time"
                              value={win?.start || '09:00'}
                              onChange={(e) => {
                                setWorkingWindows(
                                  workingWindows.map((w) => (w.day === d.index ? { ...w, start: e.target.value } : w))
                                );
                              }}
                              className="h-7 w-24 text-xs"
                            />
                            <span>to</span>
                            <Input
                              type="time"
                              value={win?.end || '12:00'}
                              onChange={(e) => {
                                setWorkingWindows(
                                  workingWindows.map((w) => (w.day === d.index ? { ...w, end: e.target.value } : w))
                                );
                              }}
                              className="h-7 w-24 text-xs"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right: Busy / Exam Blocks */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Exam &amp; Busy Blocks (No Tasks Scheduled)
                </label>
                <div className="mt-2 space-y-2">
                  {busyBlocks.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No busy blocks added.</p>
                  ) : (
                    busyBlocks.map((b, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-lg border border-border bg-card p-2.5">
                        <div>
                          <p className="text-xs font-semibold text-foreground">{b.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {b.start.slice(0, 16).replace('T', ' ')} to {b.end.slice(0, 16).replace('T', ' ')}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setBusyBlocks(busyBlocks.filter((_, i) => i !== idx))}
                          className="size-7 text-muted-foreground hover:text-red-500"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add Busy Block */}
              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                <p className="text-xs font-medium text-foreground">Add Busy Interval</p>
                <Input
                  placeholder="e.g. Midterm Exams, Hackathon Weekend"
                  value={newBusyTitle}
                  onChange={(e) => setNewBusyTitle(e.target.value)}
                  className="h-8 text-xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Start</label>
                    <Input
                      type="datetime-local"
                      value={newBusyStart}
                      onChange={(e) => setNewBusyStart(e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">End</label>
                    <Input
                      type="datetime-local"
                      value={newBusyEnd}
                      onChange={(e) => setNewBusyEnd(e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (newBusyTitle && newBusyStart && newBusyEnd) {
                      setBusyBlocks([
                        ...busyBlocks,
                        {
                          title: newBusyTitle,
                          start: new Date(newBusyStart).toISOString(),
                          end: new Date(newBusyEnd).toISOString(),
                        },
                      ]);
                      setNewBusyTitle('');
                      setNewBusyStart('');
                      setNewBusyEnd('');
                    }
                  }}
                  className="w-full text-xs"
                >
                  <Plus className="mr-1 size-3.5" />
                  Add Busy Block
                </Button>
              </div>

              <div className="pt-2">
                <Button onClick={handleSaveAvailability} className="w-full">
                  Save Availability Settings
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Pressure Warnings */}
      {pressureNotes.map((note, idx) => (
        <div
          key={idx}
          className="flex items-start gap-3 rounded-lg border border-border bg-ask/30 p-4 text-sm text-foreground"
        >
          <ShieldAlert className="size-5 shrink-0 mt-0.5 text-ask-foreground" />
          <div>
            <p className="font-semibold">
              {note.type === 'same_day_deadline_pressure'
                ? 'Same-Day Deadline Pressure Detected'
                : 'High Capacity Utilization'}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{note.message}</p>
          </div>
        </div>
      ))}

      {/* Schedule Grid */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Weekly Timeline</h2>

        {displayItems.length === 0 ? (
          <Card className="border-border bg-card p-12 text-center">
            <CalendarIcon className="mx-auto size-10 text-muted-foreground/40" />
            <h3 className="mt-3 text-lg font-semibold text-foreground">No Weekly Plan Calculated Yet</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
              Click &quot;Calculate Week Plan&quot; above to deterministically schedule your eligible opportunities into free availability windows.
            </p>
            <Button className="mt-5" onClick={handleGeneratePlan} disabled={isPending}>
              Calculate Week Plan
            </Button>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {displayItems.map((item, idx) => (
              <Card key={idx} className="border-border bg-card p-4 shadow-sm hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between">
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    {item.duration_minutes || 30} mins
                  </span>
                  {item.deadline && (
                    <span className="text-[11px] font-semibold text-ask-foreground bg-ask px-2 py-0.5 rounded border border-border">
                      Due: {item.deadline.slice(0, 10)}
                    </span>
                  )}
                </div>

                <h3 className="mt-2 text-base font-semibold text-foreground line-clamp-1">
                  {item.title}
                </h3>
                <p className="text-xs text-muted-foreground">{item.organization || 'Direct Opportunity'}</p>

                <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground border-t border-border/50 pt-2.5">
                  <Clock className="size-3.5 text-primary" />
                  <span>
                    {new Date(item.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &ndash;{' '}
                    {new Date(item.end_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {'reason_codes' in item && Array.isArray((item as ScheduledTaskItem).reason_codes) && (item as ScheduledTaskItem).reason_codes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(item as ScheduledTaskItem).reason_codes.map((rc: string, i: number) => (
                      <span key={i} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {rc.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Unscheduled / Overflow Items */}
      {unscheduledItems.length > 0 && (
        <div className="space-y-3 pt-6 border-t border-border">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              Unscheduled Opportunities ({unscheduledItems.length})
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            These opportunities could not be fitted into this week due to capacity limits or deadline timing. They remain safely saved in your inbox.
          </p>

          <div className="space-y-2">
            {unscheduledItems.map((u, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-foreground">{u.title}</p>
                  <p className="text-xs text-muted-foreground">{u.organization}</p>
                </div>
                <div className="text-right">
                  <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {u.reason_code.replace(/_/g, ' ')}
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{u.explanation}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Candidate Customizer Table */}
      <div className="space-y-3 pt-6 border-t border-border">
        <h2 className="text-lg font-semibold text-foreground">Opportunity Priorities &amp; Duration Estimates</h2>
        <p className="text-xs text-muted-foreground">
          Override priority or adjust preparation duration estimates before calculating your plan.
        </p>

        <div className="space-y-2">
          {candidates.slice(0, 10).map((cand) => (
            <div
              key={cand.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{cand.title}</p>
                <p className="text-xs text-muted-foreground">
                  {cand.organization} &bull; Deadline: {cand.deadline ? cand.deadline.slice(0, 10) : 'Not stated'}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={priorities[cand.id] || 'normal'}
                  onChange={(e) => {
                    setPriorities({ ...priorities, [cand.id]: e.target.value as 'high' | 'normal' | 'low' });
                  }}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                >
                  <option value="normal">Normal Priority</option>
                  <option value="high">High Priority</option>
                  <option value="low">Low Priority</option>
                </select>

                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={15}
                    max={240}
                    step={15}
                    value={estimates[cand.id] || 30}
                    onChange={(e) => {
                      setEstimates({ ...estimates, [cand.id]: parseInt(e.target.value, 10) || 30 });
                    }}
                    className="h-8 w-20 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">mins</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
