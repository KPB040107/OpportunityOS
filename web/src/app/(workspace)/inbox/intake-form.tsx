'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, FileText, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
export function IntakeForm() {
  const [type,setType]=useState<'text'|'url'>('text'); const [content,setContent]=useState('');
  const [requestId,setRequestId]=useState<string|null>(null); const [busy,setBusy]=useState(false); const [message,setMessage]=useState(''); const [error,setError]=useState(''); const router=useRouter();
  const change=(value:string)=>{setContent(value);setRequestId(null);setMessage('');setError('');};
  async function submit(e:React.FormEvent) {
    e.preventDefault(); setBusy(true);setError('');setMessage('');const id=requestId||crypto.randomUUID();setRequestId(id);
    try {
      const response=await fetch('/api/intake',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:id,source_type:type,content})});
      const result=await response.json(); if(!response.ok) {setError(result.error || 'Could not save this submission.');return;}
      setContent('');setRequestId(null);setMessage('Saved to your inbox.');router.refresh();
    } catch {setError('Could not confirm the save. Check your inbox before retrying.');} finally {setBusy(false);}
  }
  return <form onSubmit={submit} className="space-y-4"><div className="flex gap-2">{([{value:'text',name:'Paste text',icon:FileText},{value:'url',name:'Website link',icon:Link2}] as const).map(({value,name,icon:Icon})=><Button key={value} type="button" size="sm" variant={type===value?'default':'outline'} disabled={busy} onClick={()=>{setType(value);change('');}}><Icon className="size-4"/>{name}</Button>)}</div><label htmlFor="opportunity-content" className="sr-only">{type==='text'?'Opportunity text':'Opportunity link'}</label>{type==='text'?<Textarea id="opportunity-content" placeholder="Paste an internship, hackathon, scholarship, or program announcement here…" value={content} onChange={e=>change(e.target.value)} maxLength={20000} required disabled={busy} rows={5}/>:<Input id="opportunity-content" type="url" placeholder="https://unstop.com/…" maxLength={2048} value={content} onChange={e=>change(e.target.value)} required disabled={busy}/>}
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{type==='text'?`${content.length.toLocaleString()} / 20,000 characters`:'Paste a link from any public opportunity website.'}</p><Button disabled={busy || !content.trim()}>{busy?'Saving…':'Save opportunity'}<ArrowUpRight className="size-4"/></Button></div>{message && <p role="status" className="text-sm text-primary">{message}</p>}{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}</form>;
}
