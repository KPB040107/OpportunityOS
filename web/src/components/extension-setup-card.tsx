'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Puzzle, Check, Copy, Sparkles, ShieldCheck } from 'lucide-react';

export function ExtensionSetupCard() {
  const [copied, setCopied] = useState(false);
  const extensionPath = 'C:\\OpportunityOS\\extension';

  const handleCopyPath = () => {
    navigator.clipboard.writeText(extensionPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="p-6 space-y-5 border-indigo-200 bg-gradient-to-br from-indigo-50/40 via-background to-background">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Puzzle className="size-4" />
            </span>
            <h2 className="text-lg font-bold text-foreground">
              Trajectory Browser Extension
            </h2>
            <span className="rounded-full bg-act px-2.5 py-0.5 text-xs font-semibold text-act-foreground border border-border">
              Recommended
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            1-click capture from LinkedIn, Internshala, and Unstop. Bypasses site Content Security Policies (CSP) and eliminates popup blockers.
          </p>
        </div>

        <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-900 font-medium shrink-0 flex items-center gap-1 self-start">
          <ShieldCheck className="size-3.5 text-indigo-600" />
          Manifest V3
        </span>
      </div>

      {/* 3 Step Setup Guide */}
      <div className="grid gap-3 sm:grid-cols-3 pt-1">
        <div className="rounded-lg border border-border bg-card p-3.5 space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600">
            <span className="flex size-5 rounded-full bg-indigo-100 items-center justify-center text-indigo-800">1</span>
            Open Extensions
          </div>
          <p className="text-xs text-muted-foreground">
            Navigate to <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">chrome://extensions</code> or <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">edge://extensions</code>.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-3.5 space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600">
            <span className="flex size-5 rounded-full bg-indigo-100 items-center justify-center text-indigo-800">2</span>
            Enable Developer Mode
          </div>
          <p className="text-xs text-muted-foreground">
            Toggle <strong>Developer mode</strong> in the top-right corner of the extensions manager.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-3.5 space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600">
            <span className="flex size-5 rounded-full bg-indigo-100 items-center justify-center text-indigo-800">3</span>
            Click &ldquo;Load unpacked&rdquo;
          </div>
          <p className="text-xs text-muted-foreground">
            Click <strong>Load unpacked</strong> and select the directory below.
          </p>
        </div>
      </div>

      {/* Extension Folder Path Box */}
      <div className="p-3.5 rounded-lg border border-indigo-200 bg-indigo-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="text-xs space-y-0.5">
          <span className="font-semibold text-indigo-950">Extension Directory Path:</span>
          <p className="font-mono text-[11px] text-indigo-800 break-all select-all">
            {extensionPath}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyPath}
          className="gap-1.5 shrink-0 bg-white border-indigo-200 hover:bg-indigo-50 text-xs h-8"
        >
          {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
          {copied ? 'Path Copied!' : 'Copy Folder Path'}
        </Button>
      </div>

      {/* Features & Shortcut */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-indigo-100 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Sparkles className="size-3.5 text-indigo-600" />
          Pro-tip: Press <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">Alt+S</kbd> on any listing page for instant capture.
        </span>
        <span className="text-[11px]">
          Tested on LinkedIn, Unstop, Internshala, and company job portals.
        </span>
      </div>
    </Card>
  );
}
