import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Sparkles, Eye, CheckCircle2, HelpCircle, EyeOff, SlidersHorizontal, ArrowRight } from 'lucide-react';

export interface HomeCounterData {
  items_read: number;
  items_ignored: number;
  items_acted: number;
  items_asked: number;
  questions_avoided: number;
  active_rules: number;
  pending_proposals: number;
  breakdown: {
    real: {
      items_read: number;
      questions_avoided: number;
    };
    seeded: {
      items_read: number;
      questions_avoided: number;
    };
  };
}

export function AutonomyCounter({ data }: { data: HomeCounterData }) {
  return (
    <Card className="mb-8 overflow-hidden border-emerald-200/80 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/30 p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-emerald-100/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
              <Sparkles className="size-4" />
            </span>
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Autonomy Engine & Ledger
            </h2>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              PS22 Earned Autonomy
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Deterministic governance · AI proposes, code decides · Immutable student consent
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data.pending_proposals > 0 && (
            <Link
              href="/rules"
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
            >
              <Sparkles className="size-3.5 text-amber-600" />
              <span>{data.pending_proposals} Rule Proposal Pending</span>
              <ArrowRight className="size-3" />
            </Link>
          )}

          <Link
            href="/rules"
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-800 transition hover:bg-emerald-50"
          >
            <SlidersHorizontal className="size-3.5 text-emerald-600" />
            <span>{data.active_rules} Active Standing Rules</span>
          </Link>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-white/80 p-3.5 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Eye className="size-3.5 text-slate-500" />
            <span>Opportunities Read</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {data.items_read}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {data.breakdown.real.items_read} real · {data.breakdown.seeded.items_read} seeded
          </p>
        </div>

        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3.5 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="size-3.5 text-emerald-600" />
            <span>Acted Automatically</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-950">
            {data.items_acted}
          </p>
          <p className="mt-1 text-[11px] text-emerald-700">
            Tracked & notified
          </p>
        </div>

        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3.5 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-900">
            <HelpCircle className="size-3.5 text-amber-600" />
            <span>Questions Asked</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-amber-950">
            {data.items_asked}
          </p>
          <p className="mt-1 text-[11px] text-amber-700">
            Awaiting human input
          </p>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
            <EyeOff className="size-3.5 text-slate-500" />
            <span>Items Ignored</span>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {data.items_ignored}
          </p>
          <p className="mt-1 text-[11px] text-slate-600">
            Ineligible or expired
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200/90 bg-emerald-600 p-3.5 text-white shadow-xs">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-white/20 text-white">
            <Sparkles className="size-4" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-100">
              Earned Autonomy Dividend
            </p>
            <p className="text-sm font-bold">
              {data.questions_avoided} Questions Avoided by Standing Rules
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="rounded-md bg-white/15 px-2.5 py-1 text-[11px] font-medium text-emerald-50">
            Real avoids: {data.breakdown.real.questions_avoided} · Seeded avoids: {data.breakdown.seeded.questions_avoided}
          </span>
          <Link
            href="/rules"
            className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50"
          >
            <span>View Ledger</span>
            <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
