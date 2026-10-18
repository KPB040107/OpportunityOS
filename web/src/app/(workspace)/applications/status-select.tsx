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
            try {
              await updateApplicationStatus(id, val);
            } catch (err) {
              console.error('Failed to update status:', err);
            }
          });
        }}
        className={`rounded-[8px] border-[1.5px] border-border px-3 py-1.5 font-mono text-xs font-semibold ${
          currentStatus === 'to_apply'
            ? 'bg-act text-foreground'
            : currentStatus === 'applied'
            ? 'bg-white text-foreground'
            : currentStatus === 'interview' || currentStatus === 'offer'
            ? 'bg-ask text-foreground'
            : 'bg-skip text-muted-foreground'
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
