'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Bookmark, EyeOff, AlertCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { recordDecisionAction } from '@/app/(workspace)/rules/actions';

interface DecisionToolbarProps {
  opportunityId: string;
  canApprove: boolean;
  initialDecision?: {
    choice: string;
    created_at: string;
  } | null;
}

export function DecisionToolbar({ opportunityId, canApprove, initialDecision }: DecisionToolbarProps) {
  const [currentChoice, setCurrentChoice] = useState<string | null>(initialDecision?.choice || null);
  const [loading, setLoading] = useState(false);
  const [ruleProposed, setRuleProposed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChoice = async (choice: 'approve' | 'pin' | 'ignore') => {
    setLoading(true);
    setError(null);
    try {
      const res = await recordDecisionAction(opportunityId, choice);
      if (!res.success) {
        setError(res.error || 'Failed to record choice');
      } else {
        setCurrentChoice(choice);
        if (res.data?.proposal_created) {
          setRuleProposed(true);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error recording decision');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mt-6 border-border bg-white shadow-hard p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Student Action & Earned Autonomy
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Consistent choices teach the agent your preferences. 3 consistent approvals propose an automatic standing rule.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={currentChoice === 'approve' ? 'default' : 'outline'}
            className={currentChoice === 'approve' ? 'bg-act text-act-foreground border-[1.5px] border-border font-semibold shadow-hard-sm' : 'border-[1.5px] border-border text-foreground hover:bg-muted font-semibold'}
            disabled={loading || !canApprove}
            onClick={() => handleChoice('approve')}
          >
            <CheckCircle2 className="size-4 mr-1.5" />
            {currentChoice === 'approve' ? 'Approved & Tracked' : 'Approve & Track'}
          </Button>

          <Button
            size="sm"
            variant={currentChoice === 'pin' ? 'default' : 'outline'}
            className={currentChoice === 'pin' ? 'bg-primary text-white' : ''}
            disabled={loading}
            onClick={() => handleChoice('pin')}
          >
            <Bookmark className="size-4 mr-1.5" />
            {currentChoice === 'pin' ? 'Pinned' : 'Pin for Later'}
          </Button>

          <Button
            size="sm"
            variant={currentChoice === 'ignore' ? 'outline' : 'ghost'}
            className={currentChoice === 'ignore' ? 'bg-slate-200 text-slate-800' : 'text-muted-foreground hover:bg-red-50 hover:text-red-700'}
            disabled={loading}
            onClick={() => handleChoice('ignore')}
          >
            <EyeOff className="size-4 mr-1.5" />
            {currentChoice === 'ignore' ? 'Ignored' : 'Ignore'}
          </Button>
        </div>
      </div>

      {!canApprove && (
        <p className="mt-3 text-xs text-ask-foreground bg-ask/40 border border-border p-2 rounded-lg font-medium">
          Approval is available after eligibility is verified. You can still pin this listing while reviewing its requirements.
        </p>
      )}

      {ruleProposed && (
        <div className="mt-4 rounded-xl border border-border bg-act p-4 text-xs text-act-foreground flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-300">
          <div className="flex items-center gap-2 font-medium">
            <Sparkles className="size-5 text-act-foreground shrink-0" />
            <span>
              <strong>Standing rule proposed!</strong> 3 consistent decisions detected. Review and activate it to automate future listings.
            </span>
          </div>
          <Button asChild size="sm" variant="default" className="bg-primary hover:opacity-90 text-primary-foreground border-[1.5px] border-border font-semibold text-xs h-8 shadow-hard-sm">
            <Link href="/rules">Review proposed rule &rarr;</Link>
          </Button>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-red-600 flex items-center gap-1.5">
          <AlertCircle className="size-3.5" />
          {error}
        </p>
      )}
    </Card>
  );
}
