'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, PauseCircle, Sparkles, Shield, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { respondRuleAction } from './actions';

export interface StandingRuleRecord {
  id: string;
  user_id: string;
  status: 'proposed' | 'active' | 'rejected' | 'disabled';
  rule_type: string;
  source_scope: string;
  opportunity_type: string;
  title: string;
  description: string;
  conditions: {
    min_score?: number;
    min_confidence?: number;
  };
  allowed_action_types: string[];
  supporting_decision_ids: string[];
  version: number;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export function RuleCard({ rule }: { rule: StandingRuleRecord }) {
  const [status, setStatus] = useState(rule.status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (action: 'approve' | 'reject' | 'disable') => {
    setLoading(true);
    setError(null);
    try {
      const res = await respondRuleAction(rule.id, action);
      if (!res.success) {
        setError(res.error || 'Failed to update rule');
      } else {
        setStatus(res.data?.status || (action === 'approve' ? 'active' : action === 'reject' ? 'rejected' : 'disabled'));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error updating rule');
    } finally {
      setLoading(false);
    }
  };

  const isProposed = status === 'proposed';
  const isActive = status === 'active';

  return (
    <Card className={`p-5 transition ${isProposed ? 'border-amber-300 bg-amber-50/40 shadow-xs' : isActive ? 'border-emerald-200 bg-emerald-50/30' : 'opacity-70 bg-muted/30'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              isProposed ? 'bg-amber-100 text-amber-900 border border-amber-300' :
              isActive ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' :
              'bg-slate-100 text-slate-700 border border-slate-200'
            }`}>
              {isProposed ? <Sparkles className="size-3 text-amber-600" /> : <Shield className="size-3 text-emerald-600" />}
              {status.toUpperCase()}
            </span>
            <span className="text-xs text-muted-foreground uppercase font-medium">
              Scope: {rule.source_scope} · {rule.opportunity_type}
            </span>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-foreground">{rule.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{rule.description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isProposed && (
            <>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={loading}
                onClick={() => handleAction('approve')}
              >
                <CheckCircle2 className="size-4 mr-1.5" />
                Approve Rule
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-700 hover:bg-red-50 border-red-200"
                disabled={loading}
                onClick={() => handleAction('reject')}
              >
                <XCircle className="size-4 mr-1.5" />
                Reject
              </Button>
            </>
          )}

          {isActive && (
            <Button
              size="sm"
              variant="outline"
              className="text-muted-foreground hover:bg-slate-100"
              disabled={loading}
              onClick={() => handleAction('disable')}
            >
              <PauseCircle className="size-4 mr-1.5" />
              Disable Rule
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-border/60 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
        <div>
          <span className="text-muted-foreground">Conditions:</span>
          <p className="font-medium mt-0.5">
            Min Score: {rule.conditions.min_score ?? 60} · Min Conf: {Math.round((rule.conditions.min_confidence ?? 0.65) * 100)}%
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Allowed Actions:</span>
          <p className="font-medium mt-0.5">
            {(rule.allowed_action_types || []).join(', ') || 'tracker_update, email_notification'}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Governance:</span>
          <p className="font-medium mt-0.5 text-emerald-800">
            Immutable guards enforced
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-600 flex items-center gap-1.5">
          <AlertCircle className="size-3.5" />
          {error}
        </p>
      )}
    </Card>
  );
}
