'use client';

import { useTransition } from 'react';
import { toggleSource } from './actions';
import { Button } from '@/components/ui/button';

export function ToggleButton({ id, enabled }: { id: string; enabled: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant={enabled ? 'default' : 'outline'}
      size="sm"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          try {
            await toggleSource(id, enabled);
          } catch (err) {
            console.error('Failed to toggle source:', err);
          }
        });
      }}
      className={`text-xs font-semibold ${
        enabled
          ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
          : 'text-muted-foreground hover:bg-muted'
      }`}
    >
      {isPending ? 'Updating...' : enabled ? 'Enabled' : 'Disabled'}
    </Button>
  );
}
