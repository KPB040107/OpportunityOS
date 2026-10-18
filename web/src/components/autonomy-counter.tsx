import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

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
  const stats = [
    {
      label: 'READ',
      value: data.items_read,
      note: 'listings checked against your profile',
      bg: 'bg-white',
      labelColor: 'text-muted-foreground'
    },
    {
      label: 'ACTED',
      value: data.items_acted,
      note: 'tracked and put on your calendar',
      bg: 'bg-act',
      labelColor: 'text-accent-text font-semibold'
    },
    {
      label: 'ASKED YOU',
      value: data.items_asked,
      note: 'need your answer to decide',
      bg: 'bg-ask',
      labelColor: 'text-ask-foreground font-semibold'
    },
    {
      label: 'SKIPPED',
      value: data.items_ignored,
      note: 'expired, ineligible or suspicious',
      bg: 'bg-skip',
      labelColor: 'text-muted-foreground'
    }
  ];

  return (
    <div className="mb-8 flex flex-col gap-4 font-sans">
      {/* 4 The Sorting Board Stat Bento Tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`p-4 border-[1.5px] border-border rounded-[12px] ${s.bg} shadow-hard flex flex-col gap-1 transition-all`}
          >
            <span className={`font-mono text-[11px] tracking-[0.1em] ${s.labelColor}`}>
              {s.label}
            </span>
            <span className="font-display font-extrabold text-3xl sm:text-4xl leading-none tracking-tight text-foreground">
              {s.value}
            </span>
            <span className="text-xs text-ink-2 line-clamp-2 mt-1">
              {s.note}
            </span>
          </div>
        ))}
      </div>

      {/* Earned Autonomy Dividend Strip */}
      <div className="p-4 border-[1.5px] border-border rounded-[14px] bg-white shadow-hard flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="size-8 rounded-[8px] border-[1.5px] border-border bg-act shadow-[2px_2px_0_#111111] flex items-center justify-center font-bold text-accent-text"
          >
            <Sparkles className="size-4" />
          </span>
          <div className="flex flex-col">
            <span className="font-mono text-[11px] font-semibold tracking-wider text-accent-text uppercase">
              Earned Autonomy Dividend
            </span>
            <span className="font-display font-bold text-base text-foreground">
              {data.questions_avoided} Questions Avoided by Standing Rules
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-xs text-muted-foreground">
            {data.active_rules} active rules · {data.breakdown.real.questions_avoided} real avoids
          </span>
          <Link
            href="/rules"
            className="inline-flex items-center gap-1.5 h-9 px-4 border-[1.5px] border-border rounded-[10px] bg-white text-foreground text-xs font-mono font-bold shadow-[2px_2px_0_#111111] hover:bg-muted/40 transition-all no-underline"
          >
            <span>View Ledger</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
