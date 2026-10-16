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
    <Card className="p-5 border-amber-200/80 bg-amber-50/20">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
              Needs Source Review
            </span>
            <span className="text-xs uppercase text-muted-foreground font-medium">
              {item.type}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
              Insufficient information to score
            </span>
          </div>

          <h3 className="text-lg font-semibold">
            <Link href={`/opportunities/${item.id}`} className="hover:text-primary transition-colors">
              {item.title || 'Untitled Opportunity'}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">{item.organization || 'Unknown Organisation'}</p>

          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-medium flex items-center gap-1.5 text-xs text-amber-900">
              <AlertCircle className="size-4 text-amber-600 shrink-0" />
              The source has insufficient detail:
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-900">
              {item.explanation || 'No explicit eligibility criteria or deadlines were extracted from this listing. Approval cannot authorize actions on incomplete criteria.'}
            </p>
          </div>
        </div>

        <div className="sm:shrink-0 flex flex-col items-end gap-2">
          <div className="flex flex-wrap gap-2">
            {item.application_url && (
              <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs">
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
              className={`gap-1.5 text-xs ${
                approved
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'border-emerald-300 text-emerald-800 hover:bg-emerald-50'
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
              className="gap-1.5 text-xs"
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
            <span className="text-[11px] text-emerald-700 font-medium">{message}</span>
          )}
        </div>
      </div>
    </Card>
  );
}
