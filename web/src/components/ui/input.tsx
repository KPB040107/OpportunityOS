import * as React from 'react';
import { cn } from '@/lib/utils';
export function Input({className,...props}:React.ComponentProps<'input'>) {
  return <input data-slot="input" className={cn('flex h-11 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',className)} {...props}/>;
}
