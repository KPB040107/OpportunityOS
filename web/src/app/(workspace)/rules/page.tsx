import { requireUser } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { LiveUpdates } from '@/components/live-updates';
import { formatDate } from '@/lib/utils';
import { AutonomyCounter, type HomeCounterData } from '@/components/autonomy-counter';
import { RuleCard, type StandingRuleRecord } from './rule-card';
import { Sparkles, Shield, History, ArrowRight, CheckCircle2 } from 'lucide-react';

interface LedgerItem {
  id: string;
  opportunity_id: string;
  baseline_decision: string;
  effective_decision: string;
  question_avoided: boolean;
  is_override: boolean;
  is_seeded: boolean;
  reason: string;
  created_at: string;
}

export default async function RulesPage() {
  const { supabase, user } = await requireUser();

  const [counterRes, rulesRes, ledgerRes] = await Promise.all([
    supabase.rpc('get_home_counter'),
    supabase
      .from('standing_rules')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('autonomy_ledger')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30)
  ]);

  if (rulesRes.error || ledgerRes.error) {
    throw new Error('Rules and ledger data unavailable');
  }

  const counterData = (counterRes.data || {
    items_read: 0,
    items_ignored: 0,
    items_acted: 0,
    items_asked: 0,
    questions_avoided: 0,
    active_rules: 0,
    pending_proposals: 0,
    breakdown: {
      real: { items_read: 0, questions_avoided: 0 },
      seeded: { items_read: 0, questions_avoided: 0 }
    }
  }) as HomeCounterData;

  const allRules = (rulesRes.data || []) as StandingRuleRecord[];
  const proposedRules = allRules.filter((r) => r.status === 'proposed');
  const activeRules = allRules.filter((r) => r.status === 'active');
  const inactiveRules = allRules.filter((r) => ['disabled', 'rejected'].includes(r.status));

  const ledger = (ledgerRes.data || []) as LedgerItem[];

  // Fetch opportunity titles for ledger items
  const oppIds = [...new Set(ledger.map((l) => l.opportunity_id))];
  const oppsRes = oppIds.length
    ? await supabase
        .from('opportunities')
        .select('id,title,organization,type')
        .in('id', oppIds)
    : { data: [] };
  const oppMap = new Map((oppsRes.data || []).map((o) => [o.id, o]));

  return (
    <>
      <LiveUpdates userId={user.id} />
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Automation & Control</p>
          <h1 className="mt-2 text-3xl font-semibold">Your automation preferences</h1>
          <p className="mt-3 text-muted-foreground">
            After you repeatedly approve similar safe actions, OpportunityOS can suggest doing those actions automatically next time. You remain in control and can revoke preferences at any time.
          </p>
        </div>
      </div>

      <AutonomyCounter data={counterData} />

      {/* Section 1: Pending Rule Proposals */}
      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-amber-600" />
            <h2 className="text-xl font-bold tracking-tight text-foreground">Suggested automation preferences</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            Proposed by code after 3 consecutive consistent choices
          </span>
        </div>

        {proposedRules.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground border-dashed">
            <p className="text-sm">No pending proposals right now.</p>
            <p className="mt-1 text-xs">
              When you make 3 consistent decisions for a source (e.g. approving 3 Lever internships), the code will propose an automation preference here for your review.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {proposedRules.map((rule) => (
              <RuleCard key={rule.id} rule={rule} />
            ))}
          </div>
        )}
      </section>

      {/* Section 2: Active Automation Preferences */}
      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="size-5 text-emerald-600" />
            <h2 className="text-xl font-bold tracking-tight text-foreground">Active automation preferences</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            Active permissions can be disabled or revoked at any time
          </span>
        </div>

        {activeRules.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground border-dashed">
            <p className="text-sm">No active automation preferences yet.</p>
            <p className="mt-1 text-xs">
              Approved preferences will handle future incoming opportunities that match your verified criteria without asking each time.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {activeRules.map((rule) => (
              <RuleCard key={rule.id} rule={rule} />
            ))}
          </div>
        )}

        {inactiveRules.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              View {inactiveRules.length} disabled or rejected preferences
            </summary>
            <div className="mt-3 space-y-3">
              {inactiveRules.map((rule) => (
                <RuleCard key={rule.id} rule={rule} />
              ))}
            </div>
          </details>
        )}
      </section>

      {/* Section 3: What the agent did Audit Log */}
      <section className="mb-10">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="size-5 text-slate-600" />
            <h2 className="text-xl font-bold tracking-tight text-foreground">What the agent did</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            Plain-language activity log of automated actions and decisions
          </span>
        </div>

        {ledger.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground border-dashed">
            <p className="text-sm">Ledger is empty.</p>
            <p className="mt-1 text-xs">
              As standing rules apply to incoming listings or overrides occur, immutable ledger records are recorded here.
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/50 text-muted-foreground font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Opportunity</th>
                    <th className="px-4 py-3">Baseline &rarr; Effective</th>
                    <th className="px-4 py-3">Outcome</th>
                    <th className="px-4 py-3">Reason / Scope</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {ledger.map((item) => {
                    const opp = oppMap.get(item.opportunity_id);
                    return (
                      <tr key={item.id} className="hover:bg-muted/30 transition">
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {formatDate(item.created_at)}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground max-w-xs truncate">
                          {opp?.title || 'Opportunity'}
                          {opp?.organization && (
                            <span className="block text-[11px] text-muted-foreground font-normal truncate">
                              {opp.organization} · {opp.type}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 font-semibold">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-800">
                              {item.baseline_decision}
                            </span>
                            <ArrowRight className="size-3 text-muted-foreground" />
                            <span className={`rounded px-1.5 py-0.5 ${
                              item.effective_decision === 'ACT'
                                ? 'bg-emerald-100 text-emerald-900'
                                : item.effective_decision === 'IGNORE'
                                ? 'bg-slate-100 text-slate-700'
                                : 'bg-amber-100 text-amber-900'
                            }`}>
                              {item.effective_decision}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {item.question_avoided ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                              <CheckCircle2 className="size-3 text-emerald-600" />
                              Question Avoided
                            </span>
                          ) : item.is_override ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800">
                              Manual Override
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {item.is_seeded && (
                            <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800 font-medium border border-amber-200">
                              Seeded
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground max-w-sm truncate">
                          {item.reason}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>
    </>
  );
}
