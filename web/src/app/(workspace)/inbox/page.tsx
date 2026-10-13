import Link from 'next/link';
import { Inbox, FileText, Link2, ArrowUpRight } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LiveUpdates } from '@/components/live-updates';
import { IntakeForm } from './intake-form';
import type { RawItem } from '@/lib/types';
import {opportunityFields,deadlineLabel,errorMessages,flagLabel,type Opportunity} from '@/lib/analysis';
import {RetryForm} from './retry-form';
import {matchFields,type Match} from '@/lib/decisions';
import {DecisionSummary} from '@/components/decision-panel';
export default async function InboxPage() {
  const {supabase,user}=await requireUser();
  const [items,profile]=await Promise.all([supabase.from('raw_items').select('id,source_type,raw_content,status,error_code,created_at,is_opportunity,duplicate_of,retry_count').eq('user_id',user.id).order('created_at',{ascending:false}).limit(50),supabase.from('profiles').select('display_name,autonomy_mode').eq('user_id',user.id).maybeSingle()]);
  if(items.error || profile.error) throw new Error('Inbox data unavailable');
  const rows=items.data as RawItem[]; const name=profile.data?.display_name?.split(' ')[0];
  const links=rows.length?await supabase.from('opportunity_sources').select('raw_item_id,opportunity_id').eq('user_id',user.id).in('raw_item_id',rows.map(r=>r.id)):{data:[],error:null};
  if(links.error)throw new Error('Opportunity sources unavailable');
  const ids=[...new Set((links.data||[]).map(s=>s.opportunity_id))];
  const extracted=ids.length?await supabase.from('opportunities').select(opportunityFields).eq('user_id',user.id).in('id',ids):{data:[],error:null};
  if(extracted.error)throw new Error('Opportunity details unavailable');
  const opportunities=(extracted.data||[]) as unknown as Opportunity[];
  const evaluations=ids.length?await supabase.from('matches').select(matchFields).eq('user_id',user.id).in('opportunity_id',ids):{data:[],error:null};
  if(evaluations.error)throw new Error('Evaluations unavailable');
  const matches=(evaluations.data||[]) as unknown as Match[];
  return <><LiveUpdates userId={user.id}/><div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-widest text-primary">Your next chapter</p><h1 className="mt-2 text-3xl font-semibold">{name?`${name}’s opportunity inbox`:'Opportunity inbox'}</h1><p className="mt-3 text-muted-foreground">A home for the possibilities you want to explore.</p></div><span className="rounded-full border border-border bg-white px-4 py-2 text-xs text-muted-foreground">{profile.data?.autonomy_mode||'balanced'} mode · Asia/Kolkata</span></div>
  {!profile.data && <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 border-emerald-200 bg-emerald-50"><div><h2 className="font-semibold">Start with your profile</h2><p className="mt-1 text-sm text-muted-foreground">Add your academic details, skills, and interests.</p></div><Button asChild size="sm"><Link href="/profile">Complete profile<ArrowUpRight className="size-4"/></Link></Button></Card>}
  <Card className="mb-8"><div className="mb-5"><h2 className="text-xl font-semibold">Found something interesting?</h2><p className="mt-2 text-sm text-muted-foreground">Save the announcement or its website link.</p></div><IntakeForm/></Card>
  <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Your submissions</h2><span className="text-sm text-muted-foreground">{rows.length===50?'Latest 50':`${rows.length} saved`}</span></div><p className="mb-5 text-sm text-muted-foreground">Opportunity details appear as analysis finishes. Open a card to check its requirements and source evidence.</p>
  {!rows.length?<Card className="py-12 text-center"><Inbox className="mx-auto mb-4 size-9 text-primary/60"/><h3 className="text-lg font-semibold">An open inbox. Endless possibilities.</h3><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Save your first opportunity above. It will appear here once the workflow confirms the save.</p></Card>:<div className="grid items-start gap-4 lg:grid-cols-2">{rows.map(item=>{
    const related=new Set((links.data||[]).filter(s=>s.raw_item_id===item.id).map(s=>s.opportunity_id));
    return <Card key={item.id} className="min-w-0"><div className="mb-4 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">{item.source_type==='url'?<Link2 className="size-4"/>:<FileText className="size-4"/>}{item.source_type==='url'?'Website link':item.source_type==='email'?'Forwarded email':'Pasted announcement'}</span><span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.status==='failed'?'bg-red-50 text-red-800':'bg-emerald-50 text-primary'}`}>{({queued:'Awaiting analysis',processing:'Reading the announcement',understood:item.is_opportunity===false?'No opportunity found':'Details ready',failed:'Needs attention'} as Record<string,string>)[item.status]||item.status}</span></div>
    {/^DEMO DATA|^SETUP TEST/i.test(item.raw_content)&&<p className="mb-3 text-xs font-semibold text-amber-800">Demo data · simulated announcement</p>}
    {item.duplicate_of&&<p className="mb-3 text-xs text-muted-foreground">Repeated content · existing analysis reused when available</p>}
    {opportunities.filter(o=>related.has(o.id)).map(o=><div key={o.id} className="mb-4 rounded-xl border border-border bg-muted/40 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-primary">{o.type==='unknown'?'Opportunity':o.type}</p><h3 className="mt-2 text-lg font-semibold"><Link className="hover:underline" href={`/opportunities/${o.id}`}>{o.title||'Title not stated'}</Link></h3><p className="mt-1 text-sm text-muted-foreground">{o.organization||'Organisation unknown'}</p><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Deadline</dt><dd className="mt-1">{deadlineLabel(o.deadline)}</dd></div><div><dt className="text-xs text-muted-foreground">Location</dt><dd className="mt-1">{o.location||'Unknown'}</dd></div></dl>{o.skills.length>0&&<p className="mt-3 text-xs text-muted-foreground">Skills: {o.skills.join(', ')}</p>}{o.ambiguity_flags.length>0&&<p className="mt-3 text-xs text-amber-800">{flagLabel(o.ambiguity_flags[0])}{o.ambiguity_flags.length>1?` · ${o.ambiguity_flags.length-1} more points to clarify`:''}</p>}<DecisionSummary match={matches.find(m=>m.opportunity_id===o.id)}/><Link className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline" href={`/opportunities/${o.id}`}>View details and evidence<ArrowUpRight className="size-4"/></Link></div>)}
    {item.status==='understood'&&item.is_opportunity===false&&<p className="mb-3 text-sm text-muted-foreground">We did not find a concrete opportunity in this submission. You can paste a specific announcement instead.</p>}
    {item.error_code&&<p className="mb-3 text-sm text-red-800">{errorMessages[item.error_code]||'Analysis needs attention. Your submission is preserved.'}</p>}
    {item.status==='failed'&&!item.duplicate_of&&item.retry_count<2&&<RetryForm id={item.id}/>}
    <details className="mt-4"><summary className="cursor-pointer text-xs font-medium text-muted-foreground">Original submission</summary><p className="mt-3 max-h-48 overflow-auto break-words whitespace-pre-wrap text-sm leading-relaxed">{item.raw_content}</p></details><p className="mt-5 text-xs text-muted-foreground">Saved {formatDate(item.created_at)}</p></Card>;
  })}</div>}</>;
}
