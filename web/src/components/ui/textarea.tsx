import * as React from 'react';
import { cn } from '@/lib/utils';
export function Textarea({className,...props}:React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn('flex min-h-28 w-full rounded-xl border border-border bg-white px-3 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',className)} {...props}/>;
}
