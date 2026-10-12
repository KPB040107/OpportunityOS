'use client';
import { useTransition } from 'react';
import { resolveApprovalAction } from './actions';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';

export function ResolveButtons({ approvalId }: { approvalId: string }) {
  const [isPending, startTransition] = useTransition();

  const handleResolve = (outcome: 'approved' | 'rejected') => {
    startTransition(async () => {
      await resolveApprovalAction(approvalId, outcome);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        disabled={isPending}
        onClick={() => handleResolve('approved')}
        className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
      >
        <Check className="size-4 mr-1" />
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => handleResolve('rejected')}
        className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
      >
        <X className="size-4 mr-1" />
        Reject
      </Button>
    </div>
  );
}
