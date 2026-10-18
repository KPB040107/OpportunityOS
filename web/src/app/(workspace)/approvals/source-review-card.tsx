'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle, ExternalLink, Bookmark, EyeOff, CheckCircle2 } from 'lucide-react';
import { toggleSaveAction, toggleHideAction } from '../inbox/actions';
import { trackOpportunityDirectlyAction } from './actions';

export interface SourceReviewItem {
  id: string;
  title: string;
  organization: string;
  type: string;
  location: string | null;
  application_url: string | null;
  risk_signals?: string[];
  explanation?: string;
  is_saved?: boolean;
  is_hidden?: boolean;
  is_tracked?: boolean;
}

export function SourceReviewCard({ item }: { item: SourceReviewItem }) {
  const [saved, setSaved] = useState(item.is_saved ?? false);
  const [hidden, setHidden] = useState(item.is_hidden ?? false);
  const [approved, setApproved] = useState(item.is_tracked ?? false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const handleApprove = () => {
    start(async () => {
      const res = await trackOpportunityDirectlyAction(item.id);
      if (res.success) {
        setApproved(true);
        setMessage(res.success);
      } else if (res.error) {
        setMessage(res.error);
      }
    });
  };

  const handleToggleSave = () => {
    start(async () => {
      const res = await toggleSaveAction(item.id);
      if (res.success && res.is_saved !== undefined) {
        setSaved(res.is_saved);
      }
    });
  };

  const handleToggleHide = () => {
    start(async () => {
      const res = await toggleHideAction(item.id);
      if (res.success && res.is_hidden !== undefined) {
        setHidden(res.is_hidden);
      }
    });
  };

  if (hidden) {
    return (
      <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground flex items-center justify-between">
        <span>Hidden: {item.title} ({item.organization})</span>
        <Button size="sm" variant="ghost" onClick={handleToggleHide} disabled={pending} className="text-xs">
          Unhide
        </Button>
      </div>
    );
  }

  return (
    <Card className="p-5 border-[1.5px] border-border rounded-[14px] bg-white shadow-hard">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border-[1.5px] border-border bg-ask px-2.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
              Needs Source Review
            </span>
            <span className="text-xs uppercase font-mono text-muted-foreground font-semibold">
              {item.type}
            </span>
            <span className="rounded-full border-[1.5px] border-border bg-skip px-2.5 py-0.5 font-mono text-[11px] font-medium text-foreground">
              Insufficient information to score
            </span>
          </div>

          <h3 className="text-lg font-display font-bold text-foreground">
            <Link href={`/opportunities/${item.id}`} className="hover:text-accent-text transition-colors">
              {item.title || 'Untitled Opportunity'}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">{item.organization || 'Unknown Organisation'}</p>

          <div className="mt-3 rounded-[10px] border-[1.5px] border-border bg-[#F3F1EC] p-3 text-sm text-foreground">
            <p className="font-semibold flex items-center gap-1.5 text-xs text-foreground">
              <AlertCircle className="size-4 text-accent-text shrink-0" />
              The source has insufficient detail:
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">
              {item.explanation || 'No explicit eligibility criteria or deadlines were extracted from this listing. Approval cannot authorize actions on incomplete criteria.'}
            </p>
          </div>
        </div>

        <div className="sm:shrink-0 flex flex-col items-end gap-2">
          <div className="flex flex-wrap gap-2">
            {item.application_url && (
              <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs border-[1.5px] border-border shadow-[2px_2px_0_#111111]">
                <a href={item.application_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3.5" />
                  View original listing
                </a>
              </Button>
            )}
            <Button
              size="sm"
              variant={approved ? 'default' : 'outline'}
              onClick={handleApprove}
              disabled={pending || approved}
              className={`gap-1.5 text-xs border-[1.5px] border-border shadow-[2px_2px_0_#111111] ${
                approved
                  ? 'bg-act text-act-foreground font-bold'
                  : 'bg-white text-foreground hover:bg-muted font-semibold'
              }`}
            >
              <CheckCircle2 className="size-3.5" />
              {approved ? 'Approved & Tracked' : 'Approve & Track'}
            </Button>
            <Button
              size="sm"
              variant={saved ? 'default' : 'outline'}
              onClick={handleToggleSave}
              disabled={pending}
              className="gap-1.5 text-xs border-[1.5px] border-border shadow-[2px_2px_0_#111111]"
            >
              <Bookmark className={`size-3.5 ${saved ? 'fill-current' : ''}`} />
              {saved ? 'Saved' : 'Save'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleToggleHide}
              disabled={pending}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <EyeOff className="size-3.5" />
              Hide
            </Button>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {approved ? 'Tracked in your Applications board' : 'Approve directly to track in Applications, or save for review'}
          </span>
          {message && (
            <span className="text-[11px] font-mono text-muted-foreground font-medium">{message}</span>
          )}
        </div>
      </div>
    </Card>
  );
}
