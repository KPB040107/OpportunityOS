'use client';
import { useState, useTransition } from 'react';
import { resolveClarificationAction } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HelpCircle, CheckCircle, RefreshCw } from 'lucide-react';
import type { FormState } from '@/lib/types';

export interface ClarificationItem {
  id: string;
  missing_fact: string;
  requirement_kind: string;
  question_text: string;
  affected_opportunity_ids: string[];
  status: string;
  created_at: string;
}

export function ClarificationCard({ clarification }: { clarification: ClarificationItem }) {
  const [val, setVal] = useState('');
  const [pending, start] = useTransition();
  const [state, setState] = useState<FormState>({});

  const handleResolve = (e: React.FormEvent) => {
    e.preventDefault();
    if (!val.trim()) return;

    let payload: Record<string, unknown> = { value: val.trim() };
    if (clarification.requirement_kind === 'cgpa') {
      const num = parseFloat(val.trim());
      if (isNaN(num) || num < 0 || num > 10) {
        setState({ error: 'Please enter a valid CGPA between 0 and 10.' });
        return;
      }
      payload = { value: num };
    } else if (['graduation_year', 'academic_year'].includes(clarification.requirement_kind)) {
      const num = parseInt(val.trim(), 10);
      if (isNaN(num) || num < 2000 || num > 2100) {
        setState({ error: 'Please enter a valid year.' });
        return;
      }
      payload = { value: num };
    }

    start(async () => {
      try {
        const res = await resolveClarificationAction(clarification.id, payload);
        setState(res);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Could not update fact. Please try again.';
        setState({ error: msg });
      }
    });
  };

  const count = clarification.affected_opportunity_ids?.length || 0;

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/30 p-5">
      <div className="flex items-start gap-3">
        <HelpCircle className="size-5 text-sky-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-900">
              Needs Information
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {clarification.missing_fact}
            </span>
            {count > 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                Affects {count} {count === 1 ? 'opportunity' : 'opportunities'}
              </span>
            )}
          </div>

          <h3 className="mt-2 text-base font-semibold text-foreground">
            {clarification.question_text || `Clarification needed for ${clarification.missing_fact}`}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Submitting this fact updates your profile revision and immediately re-evaluates all affected opportunities.
          </p>

          <form onSubmit={handleResolve} className="mt-4 flex flex-wrap items-center gap-3">
            <Input
              type={clarification.requirement_kind === 'cgpa' ? 'number' : 'text'}
              step={clarification.requirement_kind === 'cgpa' ? '0.01' : undefined}
              placeholder={
                clarification.requirement_kind === 'cgpa'
                  ? 'e.g. 8.5'
                  : clarification.requirement_kind === 'graduation_year'
                  ? 'e.g. 2026'
                  : 'Enter your answer'
              }
              value={val}
              onChange={(e) => setVal(e.target.value)}
              disabled={pending || !!state.success}
              className="max-w-xs bg-white text-sm"
              required
            />
            <Button size="sm" type="submit" disabled={pending || !val.trim() || !!state.success}>
              {pending ? (
                <>
                  <RefreshCw className="mr-1.5 size-3.5 animate-spin" />
                  Updating & Reevaluating...
                </>
              ) : (
                'Save Fact & Reevaluate'
              )}
            </Button>
          </form>

          {state.error && <p className="mt-2 text-xs font-medium text-red-700">{state.error}</p>}
          {state.success && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-act-foreground">
              <CheckCircle className="size-4" />
              {state.success}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
