'use client';

import { useTransition } from 'react';
import { seedPresetsAction } from './actions';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

export function SeedPresetsButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await seedPresetsAction();
        });
      }}
      className="inline-flex items-center gap-1.5 text-xs font-semibold"
    >
      <Sparkles className="size-3.5 text-primary" />
      {isPending ? 'Loading Presets...' : 'Load Verified Presets'}
    </Button>
  );
}
