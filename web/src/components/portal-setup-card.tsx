'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, Copy, Check, CheckCircle2, Clock, ShieldCheck, ExternalLink } from 'lucide-react';

interface PortalSetupProps {
  aliasToken: string | null;
  verifiedPortals: string[];
  forwardingReceived?: boolean;
}

export function PortalSetupCard({ aliasToken, verifiedPortals = [], forwardingReceived = false }: PortalSetupProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'linkedin' | 'unstop' | 'internshala'>('linkedin');

  const forwardingAddress = aliasToken
    ? `opportunityos0001+${aliasToken}@gmail.com`
    : 'Save profile to generate alias';

  const handleCopy = () => {
    if (!aliasToken) return;
    navigator.clipboard.writeText(forwardingAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const portals = [
    {
      id: 'linkedin' as const,
      name: 'LinkedIn Job Alerts',
      domain: 'linkedin.com',
      fromFilter: 'jobalerts-noreply@linkedin.com',
      setupUrl: 'https://www.linkedin.com/jobs/',
      description: 'Daily or weekly search alerts for engineering, data, and intern roles.',
      instructions: [
        'Search for your target role (e.g. "Software Engineer Intern") on LinkedIn and toggle on "Set alert".',
        'In your personal Gmail/Outlook settings, create a forwarding filter for emails from jobalerts-noreply@linkedin.com.',
        'Set the destination to your personal OpportunityOS forwarding address above.'
      ]
    },
    {
      id: 'unstop' as const,
      name: 'Unstop Competitions & Hackathons',
      domain: 'unstop.com',
      fromFilter: 'alerts@unstop.com',
      setupUrl: 'https://unstop.com/opportunities',
      description: 'Hackathons, coding challenges, and hiring sprints.',
      instructions: [
        'Subscribe to opportunity alerts on Unstop matching your engineering or hackathon interests.',
        'In Gmail/Outlook, set an automated forwarding rule for emails from unstop.com containing competition notices.',
        'Forward directly to your personal OpportunityOS address.'
      ]
    },
    {
      id: 'internshala' as const,
      name: 'Internshala Internship Alerts',
      domain: 'internshala.com',
      fromFilter: 'alerts@internshala.com',
      setupUrl: 'https://internshala.com/internships',
      description: 'Stipend internships and part-time tech trainee opportunities.',
      instructions: [
        'Save your internship preferences on Internshala to receive daily matching internship digests.',
        'Create a Gmail or Outlook filter forwarding alert emails from internshala.com to your OpportunityOS address.',
        'Our alert parser extracts each internship separately without crawling login-gated pages.'
      ]
    }
  ];

  const currentPortal = portals.find(p => p.id === activeTab)!;
  const isCurrentVerified = verifiedPortals.includes(activeTab);

  return (
    <Card className="p-6 space-y-6">
      {/* Header and Alias Copy Box */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Mail className="size-5 text-primary" />
              <h2 className="text-lg font-semibold">Guided Alert-Email Forwarding</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Route job and competition alerts from LinkedIn, Unstop, and Internshala into your private inbox.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Verified Portals:</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-act text-act-foreground border border-border font-semibold">
              {verifiedPortals.length} / 3 Connected
            </span>
          </div>
        </div>

        {/* Alias Pill */}
        <div className="p-3.5 rounded-lg bg-muted/40 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
              Your Personal Forwarding Address
            </span>
            <code className="text-xs sm:text-sm font-mono font-medium text-foreground break-all">
              {forwardingAddress}
            </code>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            disabled={!aliasToken}
            className="gap-1.5 shrink-0"
          >
            {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
            {copied ? 'Copied' : 'Copy Address'}
          </Button>
        </div>
      </div>

      {/* Portal Tabs */}
      <div className="space-y-4 pt-2">
        <div className="flex border-b border-border gap-2 overflow-x-auto">
          {portals.map(portal => {
            const isVerified = verifiedPortals.includes(portal.id);
            const isActive = activeTab === portal.id;
            return (
              <button
                key={portal.id}
                onClick={() => setActiveTab(portal.id)}
                className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                  isActive
                    ? 'border-primary text-primary font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {portal.name}
                {isVerified ? (
                  <span className="size-2 rounded-full bg-primary" title="Portal attributable" />
                ) : forwardingReceived ? (
                  <span className="size-2 rounded-full bg-blue-500" title="Forwarding received" />
                ) : (
                  <span className="size-2 rounded-full bg-muted-foreground" title="Awaiting first alert" />
                )}
              </button>
            );
          })}
        </div>

        {/* Selected Portal Guide */}
        <div className="p-4 rounded-lg border border-border/80 bg-background/50 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                {currentPortal.name}
                <a
                  href={currentPortal.setupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
                >
                  Visit Portal <ExternalLink className="size-3" />
                </a>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">{currentPortal.description}</p>
            </div>

            {isCurrentVerified ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-act text-act-foreground border border-border">
                <CheckCircle2 className="size-3.5 text-act-foreground" />
                Portal attributable
              </span>
            ) : forwardingReceived ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-800 border border-blue-200">
                <Mail className="size-3.5 text-blue-600" />
                Forwarding received
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-ask text-ask-foreground border border-border">
                <Clock className="size-3.5 text-ask-foreground" />
                Awaiting first alert
              </span>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <span className="text-xs font-semibold text-foreground">How to configure:</span>
            <ol className="space-y-2 text-xs text-muted-foreground list-decimal list-inside">
              {currentPortal.instructions.map((step, idx) => (
                <li key={idx} className="leading-relaxed">
                  <span className="text-foreground font-medium">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="pt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-4 text-primary shrink-0" />
            <span>
              Zero password access: We never ask for your portal login credentials. Forwarding is verified automatically when the first authentic alert arrives.
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
