import Link from 'next/link';
import { Inbox, FileText, Link2, ArrowUpRight } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LiveUpdates } from '@/components/live-updates';
import { IntakeForm } from './intake-form';
import type { RawItem } from '@/lib/types';
export default async function InboxPage() {
  const {supabase,user}=await requireUser();
  const [items,profile]=await Promise.all([supabase.from('raw_items').select('id,source_type,raw_content,status,error_code,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(50),supabase.from('profiles').select('display_name').eq('user_id',user.id).maybeSingle()]);
  if(items.error || profile.error) throw new Error('Inbox data unavailable');
  const rows=items.data as RawItem[]; const name=profile.data?.display_name?.split(' ')[0];
  return <><LiveUpdates userId={user.id}/><div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-widest text-primary">Your next chapter</p><h1 className="mt-2 text-3xl font-semibold">{name?`${name}’s opportunity inbox`:'Opportunity inbox'}</h1><p className="mt-3 text-muted-foreground">A home for the possibilities you want to explore.</p></div><span className="rounded-full border border-border bg-white px-4 py-2 text-xs text-muted-foreground">Balanced mode · Asia/Kolkata</span></div>
  {!profile.data && <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 border-emerald-200 bg-emerald-50"><div><h2 className="font-semibold">Start with your profile</h2><p className="mt-1 text-sm text-muted-foreground">Add your academic details, skills, and interests.</p></div><Button asChild size="sm"><Link href="/profile">Complete profile<ArrowUpRight className="size-4"/></Link></Button></Card>}
  <Card className="mb-8"><div className="mb-5"><h2 className="text-xl font-semibold">Found something interesting?</h2><p className="mt-2 text-sm text-muted-foreground">Save the announcement or its website link.</p></div><IntakeForm/></Card>
  <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Saved opportunities</h2><span className="text-sm text-muted-foreground">{rows.length===50?'Latest 50':`${rows.length} saved`}</span></div><p className="mb-5 text-sm text-muted-foreground">These are your original submissions. Opportunity analysis will be added in the next build step.</p>
  {!rows.length?<Card className="py-12 text-center"><Inbox className="mx-auto mb-4 size-9 text-primary/60"/><h3 className="text-lg font-semibold">An open inbox. Endless possibilities.</h3><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Save your first opportunity above. It will appear here once the workflow confirms the save.</p></Card>:<div className="grid gap-4 lg:grid-cols-2">{rows.map(item=><Card key={item.id} className="min-w-0"><div className="mb-4 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">{item.source_type==='url'?<Link2 className="size-4"/>:<FileText className="size-4"/>}{item.source_type==='url'?'Website link':'Pasted announcement'}</span><span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.status==='failed'?'bg-red-50 text-red-800':'bg-emerald-50 text-primary'}`}>{item.status==='queued'?'Saved · awaiting analysis':item.status}</span></div><p className="line-clamp-5 break-words whitespace-pre-wrap text-sm leading-relaxed">{item.raw_content}</p>{item.error_code && <p className="mt-3 text-sm text-red-800">Processing needs attention.</p>}<p className="mt-5 text-xs text-muted-foreground">Saved {formatDate(item.created_at)}</p></Card>)}</div>}</>;
}
