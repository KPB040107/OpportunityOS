'use client';

import { useState, useSyncExternalStore } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bookmark, Copy, Check } from 'lucide-react';

export function BookmarkletCard({ appOrigin }: { appOrigin: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => new URL(appOrigin || 'http://localhost:3000').origin
  );

  // Minified bookmarklet JavaScript
  const bookmarkletCode = `javascript:(function(){try{var s=window.getSelection?window.getSelection().toString().trim():'';var m=document.querySelector('main,article,[role="main"],#job-details,.job-details,.description');var t=s||(m?m.innerText.slice(0,19500):'');var title=document.title||'Captured Opportunity';var u=window.location.href;var links=[];var els=(m||document).querySelectorAll('a[href]');for(var i=0;i<Math.min(els.length,15);i++){var a=els[i];var h=a.href;if(h&&(h.indexOf('http://')===0||h.indexOf('https://')===0)&&a.innerText.trim()){links.push({text:a.innerText.trim().slice(0,80),url:h});}}var w=window.open('${origin}/capture','OpportunityOSCapture','width=620,height=750,menubar=no,toolbar=no,location=no,status=no');if(!w){alert('Popup blocked. Please allow popups for ${origin} or open ${origin}/capture to paste manually.');return;}function hMsg(e){if(e.origin!=='${origin}'||e.source!==w)return;if(e.data&&e.data.type==='OPPORTUNITYOS_READY_FOR_PAYLOAD'){w.postMessage({type:'OPPORTUNITYOS_CAPTURE_PAYLOAD',requestId:e.data.requestId,payload:{title:title,url:u,text:t,links:links,captured_at:new Date().toISOString()}},'${origin}');window.removeEventListener('message',hMsg);}}window.addEventListener('message',hMsg);}catch(err){alert('Capture error: '+(err.message||err));}})();`;

  const handleCopy = async () => {
    setCopyError('');
    try {
      await navigator.clipboard.writeText(bookmarkletCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError('Clipboard access was blocked. Drag the button to your bookmarks bar instead.');
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Bookmark className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">&ldquo;Save to OpportunityOS&rdquo; Bookmarklet</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            1-click capture from LinkedIn, Internshala, and Unstop tabs directly from your browser.
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium shrink-0">
          No Extension Needed
        </span>
      </div>

      {/* Draggable button box */}
      <div className="p-4 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-sm">
          <p className="font-medium text-foreground">Drag this button to your browser Bookmarks Bar:</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Or click Copy Code to add it manually to your bookmarks.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            ref={element => { element?.setAttribute('href', bookmarkletCode); }}
            onClick={e => e.preventDefault()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium shadow hover:bg-primary/90 transition-colors cursor-grab active:cursor-grabbing select-none"
            title="Drag to Bookmarks Bar"
          >
            <Bookmark className="size-4" />
            Save to OpportunityOS
          </a>

          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
            {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
            {copied ? 'Copied' : 'Copy Code'}
          </Button>
        </div>
      </div>

      {copyError && <p role="alert" className="text-sm text-red-700">{copyError}</p>}
      {/* Usage steps */}
      <div className="grid gap-3 sm:grid-cols-3 pt-2 text-xs text-muted-foreground">
        <div className="flex gap-2">
          <span className="size-5 rounded-full bg-muted flex items-center justify-center font-bold text-foreground shrink-0">1</span>
          <span>Browse any listing or opportunity page on LinkedIn, Internshala, or Unstop.</span>
        </div>
        <div className="flex gap-2">
          <span className="size-5 rounded-full bg-muted flex items-center justify-center font-bold text-foreground shrink-0">2</span>
          <span>Click <strong>Save to OpportunityOS</strong> in your bookmarks bar.</span>
        </div>
        <div className="flex gap-2">
          <span className="size-5 rounded-full bg-muted flex items-center justify-center font-bold text-foreground shrink-0">3</span>
          <span>Inspect the preview, trim if needed, and confirm to send to your inbox.</span>
        </div>
      </div>
    </Card>
  );
}
