'use client';

import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cleanTrackingUrl, detectPortal } from '@/lib/capture';
import { Globe, CheckCircle2, AlertCircle, Scissors, ExternalLink, Loader2, ListFilter } from 'lucide-react';

interface CapturedData {
  title: string;
  url: string;
  text: string;
  links: Array<{ text: string; url: string }>;
  captured_at: string;
}

// Browser-compatible SHA-256 calculation
async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getInitialExtensionCapture(): { data: CapturedData; linkSel: Record<string, boolean> } | null {
  if (typeof window === 'undefined') return null;
  try {
    const extRaw = sessionStorage.getItem('opportunityos_extension_payload');
    if (extRaw) {
      sessionStorage.removeItem('opportunityos_extension_payload');
      const extPayload = JSON.parse(extRaw);
      if (extPayload && extPayload.url) {
        const cleanUrl = cleanTrackingUrl(extPayload.url);
        const cleanLinks = Array.isArray(extPayload.links)
          ? extPayload.links
              .map((l: { text?: string; url?: string }) => ({
                text: String(l.text || '').slice(0, 100),
                url: cleanTrackingUrl(l.url || '')
              }))
              .filter((l: { url: string }) => l.url)
          : [];
        let cleanText = String(extPayload.text || '').slice(0, 20000);
        cleanText = cleanText.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

        const linkSel: Record<string, boolean> = {};
        cleanLinks.forEach((l: { url: string }) => {
          linkSel[l.url] = true;
        });

        return {
          data: {
            title: String(extPayload.title || '').slice(0, 200) || 'Captured Opportunity',
            url: cleanUrl,
            text: cleanText,
            links: cleanLinks,
            captured_at: extPayload.captured_at || new Date().toISOString()
          },
          linkSel
        };
      }
    }
  } catch {
    // Ignore error
  }
  return null;
}

export function CaptureClient() {
  const [initExt] = useState(() => getInitialExtensionCapture());
  const [status, setStatus] = useState<'waiting' | 'preview' | 'saved' | 'error' | 'fallback'>(() => {
    if (initExt) return 'preview';
    if (typeof window !== 'undefined' && !window.opener) {
      return 'fallback';
    }
    return 'waiting';
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [captured, setCaptured] = useState<CapturedData>(() => {
    if (initExt) return initExt.data;
    return {
      title: '',
      url: '',
      text: '',
      links: [],
      captured_at: new Date().toISOString()
    };
  });
  const [selectedLinks, setSelectedLinks] = useState<Record<string, boolean>>(() => {
    if (initExt) return initExt.linkSel;
    return {};
  });
  const [savedItemId, setSavedItemId] = useState<string | null>(null);

  // Stable session request ID preserved across retries for idempotency
  const sessionRequestIdRef = useRef<string>('');

  useEffect(() => {
    // Generate stable request ID for this capture session
    if (!sessionRequestIdRef.current) {
      sessionRequestIdRef.current = crypto.randomUUID();
    }

    if (!window.opener) {
      return;
    }

    // Nonsecret readiness signal: Notify opener tab that /capture is ready for payload
    window.opener.postMessage(
      {
        type: 'OPPORTUNITYOS_READY_FOR_PAYLOAD',
        requestId: sessionRequestIdRef.current
      },
      '*'
    );

    // Fallback timer: If no response received in 3.5s, switch to manual fallback
    const timeoutId = setTimeout(() => {
      setStatus(prev => (prev === 'waiting' ? 'fallback' : prev));
    }, 3500);

    function handleMessage(event: MessageEvent) {
      // Security check: Only accept messages from the expected opener window
      if (event.source !== window.opener) return;
      if (!event.data || event.data.type !== 'OPPORTUNITYOS_CAPTURE_PAYLOAD') return;

      // Validate request ID correlation
      if (event.data.requestId !== sessionRequestIdRef.current) {
        setErrorMessage('Mismatched capture request identifier.');
        setStatus('error');
        return;
      }

      const rawPayload = event.data.payload || {};
      const rawUrl = String(rawPayload.url || '').trim();

      // Origin check: Validate that the captured page URL matches the sender's origin where applicable
      try {
        const parsedUrl = new URL(rawUrl);
        const parsedHost = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
        let eventHost = '';
        try {
          eventHost = new URL(event.origin).hostname.toLowerCase().replace(/^www\./, '');
        } catch {}
        const isDomainMatch = parsedHost === eventHost || parsedHost.endsWith('.' + eventHost) || eventHost.endsWith('.' + parsedHost);
        if (event.origin !== 'null' && parsedUrl.origin !== event.origin && !isDomainMatch) {
          setErrorMessage('Captured URL does not match sender tab origin.');
          setStatus('error');
          return;
        }
      } catch {
        setErrorMessage('Invalid URL in captured payload.');
        setStatus('error');
        return;
      }

      const cleanUrl = cleanTrackingUrl(rawUrl);
      const cleanLinks = Array.isArray(rawPayload.links)
        ? rawPayload.links
            .map((l: { text?: string; url?: string }) => ({
              text: String(l.text || '').slice(0, 100),
              url: cleanTrackingUrl(l.url || '')
            }))
            .filter((l: { url: string }) => l.url)
        : [];

      // Clean captured text of any script tags or credential strings
      let cleanText = String(rawPayload.text || '').slice(0, 20000);
      cleanText = cleanText.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

      setCaptured({
        title: String(rawPayload.title || '').slice(0, 200) || 'Captured Opportunity',
        url: cleanUrl,
        text: cleanText,
        links: cleanLinks,
        captured_at: rawPayload.captured_at || new Date().toISOString()
      });

      // Pre-select links
      const linkSel: Record<string, boolean> = {};
      cleanLinks.forEach((l: { url: string }) => {
        linkSel[l.url] = true;
      });
      setSelectedLinks(linkSel);

      setStatus('preview');
    }

    function handleExtEvent(event: Event) {
      const customEvt = event as CustomEvent;
      const extPayload = customEvt.detail;
      if (!extPayload || !extPayload.url) return;

      const cleanUrl = cleanTrackingUrl(extPayload.url);
      const cleanLinks = Array.isArray(extPayload.links)
        ? extPayload.links
            .map((l: { text?: string; url?: string }) => ({
              text: String(l.text || '').slice(0, 100),
              url: cleanTrackingUrl(l.url || '')
            }))
            .filter((l: { url: string }) => l.url)
        : [];
      let cleanText = String(extPayload.text || '').slice(0, 20000);
      cleanText = cleanText.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

      setCaptured({
        title: String(extPayload.title || '').slice(0, 200) || 'Captured Opportunity',
        url: cleanUrl,
        text: cleanText,
        links: cleanLinks,
        captured_at: extPayload.captured_at || new Date().toISOString()
      });

      const linkSel: Record<string, boolean> = {};
      cleanLinks.forEach((l: { url: string }) => {
        linkSel[l.url] = true;
      });
      setSelectedLinks(linkSel);
      setStatus('preview');
    }

    window.addEventListener('message', handleMessage);
    window.addEventListener('opportunityos:extension_payload', handleExtEvent);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('opportunityos:extension_payload', handleExtEvent);
    };
  }, []);

  const handleTrimWhitespace = () => {
    setCaptured(prev => ({
      ...prev,
      text: prev.text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim()
    }));
  };

  const handleSave = async () => {
    if (!captured.text.trim()) {
      setErrorMessage('Content is empty.');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      const activeLinks = captured.links.filter(l => selectedLinks[l.url]);
      const linkSection = activeLinks.length > 0
        ? '\n\nSource links:\n' + activeLinks.map(l => `- ${l.text || 'Link'}: ${l.url}`).join('\n')
        : '';

      const contentToSave = `Title: ${captured.title}\nSource: ${captured.url}\n\n${captured.text}${linkSection}`.slice(0, 20000);

      // 1. Compute deterministic SHA-256 payload digest
      const payloadHash = await sha256Hex(contentToSave);

      // 2. Obtain single-use server nonce bound to this session's request_id and payload digest
      const nonceRes = await fetch('/api/capture/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: sessionRequestIdRef.current,
          payload_hash: payloadHash
        })
      });

      if (!nonceRes.ok) {
        if (nonceRes.status === 401) {
          throw new Error('Please sign in to OpportunityOS to save captured opportunities.');
        }
        const errData = await nonceRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to issue secure capture authorization.');
      }

      const nonceData = await nonceRes.json();
      const nonce = nonceData.nonce;

      // 3. Atomically save via same-origin /api/intake with source_type: 'capture'
      const response = await fetch('/api/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: sessionRequestIdRef.current,
          source_type: 'capture',
          content: contentToSave,
          nonce: nonce,
          payload_hash: payloadHash,
          metadata: {
            source_url: captured.url,
            captured_at: captured.captured_at,
            selected_links: activeLinks,
            portal: detectPortal(captured.url)
          }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save captured opportunity');
      }

      setSavedItemId(data.id);
      setStatus('saved');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Save failed');
      setStatus('preview');
    } finally {
      setIsSaving(false);
    }
  };

  // Manual fallback save (when popup communication is blocked)
  const handleManualSave = async () => {
    if (!captured.text.trim()) {
      setErrorMessage('Content is empty.');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      const contentToSave = `Title: ${captured.title}\nSource: ${captured.url}\n\n${captured.text}`.slice(0, 20000);

      const response = await fetch('/api/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: sessionRequestIdRef.current || crypto.randomUUID(),
          source_type: 'text',
          content: contentToSave
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save opportunity');
      }

      setSavedItemId(data.id);
      setStatus('saved');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Save failed');
      setStatus('fallback');
    } finally {
      setIsSaving(false);
    }
  };

  const portal = detectPortal(captured.url);
  const portalBadge = portal === 'linkedin' ? 'LinkedIn' : portal === 'unstop' ? 'Unstop' : portal === 'internshala' ? 'Internshala' : 'Web Capture';

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Globe className="size-5 text-primary" />
          <h1 className="text-lg font-bold tracking-tight">Save to OpportunityOS</h1>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
          {portalBadge}
        </span>
      </div>

      {/* State: Waiting */}
      {status === 'waiting' && (
        <Card className="p-8 text-center space-y-4">
          <Loader2 className="size-8 animate-spin text-primary mx-auto" />
          <div>
            <h2 className="text-base font-semibold">Connecting to page...</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Establishing verified handshake with the source tab.
            </p>
          </div>
        </Card>
      )}

      {/* State: Error */}
      {status === 'error' && (
        <Card className="p-6 border-destructive/30 bg-destructive/5 space-y-3">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="size-5" />
            <h2 className="font-semibold text-sm">Capture Error</h2>
          </div>
          <p className="text-xs text-destructive/90">{errorMessage}</p>
          <Button variant="outline" size="sm" onClick={() => setStatus('fallback')}>
            Switch to Manual Paste
          </Button>
        </Card>
      )}

      {/* State: Fallback Manual Entry (when CSP or popup blockers intercept handshake) */}
      {status === 'fallback' && (
        <Card className="p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Manual Opportunity Paste</h2>
            <p className="text-xs text-muted-foreground">
              Direct tab communication was blocked by browser security (CSP or Popup Blocker). You can paste the announcement content directly below:
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Opportunity Title</label>
              <Input
                placeholder="e.g. SDE Intern 2026 or Flipkart GRiD 6.0"
                value={captured.title}
                onChange={e => setCaptured(prev => ({ ...prev, title: e.target.value }))}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Source URL</label>
              <Input
                placeholder="https://www.linkedin.com/jobs/view/..."
                value={captured.url}
                onChange={e => setCaptured(prev => ({ ...prev, url: e.target.value }))}
                className="mt-1"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-medium text-muted-foreground">Announcement Text</label>
                <span className="text-[11px] text-muted-foreground">{captured.text.length} / 20,000</span>
              </div>
              <Textarea
                placeholder="Paste the job description, eligibility requirements, or competition details here..."
                rows={8}
                value={captured.text}
                onChange={e => setCaptured(prev => ({ ...prev, text: e.target.value }))}
              />
            </div>

            {errorMessage && (
              <p className="text-xs text-destructive">{errorMessage}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => window.close()}>
                Cancel
              </Button>
              <Button onClick={handleManualSave} disabled={!captured.text.trim() || isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    Saving...
                  </>
                ) : (
                  'Save to Inbox'
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* State: Preview */}
      {status === 'preview' && (
        <Card className="p-6 space-y-4">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input
                value={captured.title}
                onChange={e => setCaptured(prev => ({ ...prev, title: e.target.value }))}
                className="mt-1 font-medium"
              />
            </div>

            {captured.url && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Original Link</label>
                <div className="mt-1 flex items-center justify-between p-2 rounded-md bg-muted/40 text-xs font-mono text-muted-foreground overflow-hidden">
                  <span className="truncate">{captured.url}</span>
                  <a href={captured.url} target="_blank" rel="noopener noreferrer" className="ml-2 hover:text-foreground">
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-medium text-muted-foreground">Captured Content</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTrimWhitespace}
                    className="text-[11px] text-primary hover:underline flex items-center gap-1"
                  >
                    <Scissors className="size-3" /> Trim Whitespace
                  </button>
                  <span className="text-[11px] text-muted-foreground">
                    {captured.text.length} / 20,000
                  </span>
                </div>
              </div>
              <Textarea
                rows={9}
                value={captured.text}
                onChange={e => setCaptured(prev => ({ ...prev, text: e.target.value }))}
                className="font-sans text-xs leading-relaxed"
              />
            </div>

            {/* Links detected */}
            {captured.links.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <ListFilter className="size-3.5 text-primary" />
                    Attached Opportunity Links ({captured.links.length})
                  </label>
                  <span className="text-[11px] text-muted-foreground">
                    Select target links to save
                  </span>
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto border border-border rounded-md p-2 bg-muted/20">
                  {captured.links.map((link, idx) => (
                    <label key={idx} className="flex items-start gap-2 text-xs cursor-pointer hover:bg-muted/30 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={!!selectedLinks[link.url]}
                        onChange={e => setSelectedLinks(prev => ({ ...prev, [link.url]: e.target.checked }))}
                        className="mt-0.5 rounded border-input"
                      />
                      <span className="font-medium truncate">{link.text || 'Apply Link'}</span>
                      <span className="text-muted-foreground text-[10px] truncate ml-auto">{link.url}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {errorMessage && (
              <p className="text-xs text-destructive">{errorMessage}</p>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => window.close()}>
                Discard
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving || !captured.text.trim()}>
                {isSaving ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    Saving...
                  </>
                ) : (
                  'Save to OpportunityOS'
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* State: Saved Success */}
      {status === 'saved' && (
        <Card className="p-8 text-center space-y-4">
          <div className="size-12 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="size-7" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Opportunity Saved!</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Your captured listing was saved to your Inbox with full source provenance.
            </p>
          </div>
          <div className="pt-2 flex justify-center gap-3">
            <Button variant="outline" size="sm" onClick={() => window.close()}>
              Close Window
            </Button>
            <Button size="sm" asChild>
              <a href={savedItemId ? `/inbox#item-${savedItemId}` : '/inbox'}>Go to Inbox</a>
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
