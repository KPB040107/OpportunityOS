'use client';
import { useTransition } from 'react';
import { updateApplicationStatus } from './actions';
import type { ApplicationStatus } from '@/lib/types';

const statusLabels: Record<ApplicationStatus, string> = {
  saved: 'Saved for later',
  to_apply: 'To Apply',
  applied: 'Applied',
  assessment: 'Assessment',
  interview: 'Interviewing',
  offer: 'Offer received',
  rejected: 'Archived / Rejected'
};

export function StatusSelect({ id, currentStatus }: { id: string; currentStatus: ApplicationStatus }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Application progress status"
        disabled={isPending}
        value={currentStatus}
        onChange={(e) => {
          const val = e.target.value;
          startTransition(async () => {
            await updateApplicationStatus(id, val);
          });
        }}
        className={`rounded-lg border border-border px-3 py-1.5 text-xs font-semibold ${
          currentStatus === 'to_apply'
            ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
            : currentStatus === 'applied'
            ? 'bg-blue-50 text-blue-900 border-blue-200'
            : currentStatus === 'interview' || currentStatus === 'offer'
            ? 'bg-purple-50 text-purple-900 border-purple-200'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {Object.entries(statusLabels).map(([val, label]) => (
          <option key={val} value={val}>
            {label}
          </option>
        ))}
      </select>
      {isPending && <span className="text-xs text-muted-foreground animate-pulse">Updating…</span>}
    </div>
  );
}
