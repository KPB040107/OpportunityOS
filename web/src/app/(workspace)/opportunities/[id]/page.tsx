import Link from 'next/link';
import {notFound} from 'next/navigation';
import {z} from 'zod';
import {ArrowLeft,ArrowUpRight} from 'lucide-react';
import {requireUser} from '@/lib/auth';
import {ActionStatus} from '@/components/action-status';
import {opportunityFields,deadlineLabel,flagLabel,trustBadgeDetails,type Opportunity,type Requirement,type Evidence} from '@/lib/analysis';
import {Card} from '@/components/ui/card';
import {LiveUpdates} from '@/components/live-updates';
import {formatDate} from '@/lib/utils';
import {matchFields,type Match} from '@/lib/decisions';
import {DecisionPanel} from '@/components/decision-panel';
import {DecisionToolbar} from '../decision-toolbar';

type Source={raw_item_id:string;extracted_json:{evidence:Evidence[];requirements:{kind:string;value:string;mandatory:boolean;evidence:string}[]}};

export default async function OpportunityPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;if(!z.uuid().safeParse(id).success)notFound();
  const {supabase,user}=await requireUser();
  const result=await supabase.from('opportunities').select(opportunityFields).eq('id',id).eq('user_id',user.id).maybeSingle();
  if(result.error)throw new Error('Opportunity unavailable');if(!result.data)notFound();
  const opportunity=result.data as unknown as Opportunity;
  const [requirements,sources]=await Promise.all([
    supabase.from('opportunity_requirements').select('id,kind,value,mandatory,evidence_snippet,normalized_value').eq('opportunity_id',id).eq('user_id',user.id),
    supabase.from('opportunity_sources').select('raw_item_id,extracted_json').eq('opportunity_id',id).eq('user_id',user.id).order('first_seen_at',{ascending:true}).limit(50)
  ]);
  if(requirements.error||sources.error)throw new Error('Source evidence unavailable');
  const evaluation=await supabase.from('matches').select(matchFields).eq('opportunity_id',id).eq('user_id',user.id).maybeSingle();
  if(evaluation.error)throw new Error('Evaluation unavailable');
  const match=(evaluation.data||undefined) as unknown as Match|undefined;
  const decisionRes=await supabase.from('student_decisions').select('choice,created_at').eq('opportunity_id',id).eq('user_id',user.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
  const provenance=(sources.data||[]) as Source[];
  const submissions=provenance.length?await supabase.from('raw_items').select('id,source_type,raw_content,cleaned_text,final_url,fetched_at,created_at').eq('user_id',user.id).in('id',provenance.map(s=>s.raw_item_id)):{data:[],error:null};
  if(submissions.error)throw new Error('Original submissions unavailable');
  return (
    <>
      <LiveUpdates userId={user.id}/>
      <Link href="/opportunities" className="mb-6 inline-flex items-center gap-2 text-sm text-primary"><ArrowLeft className="size-4"/>Back to opportunities</Link>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">{opportunity.type==='unknown'?'Opportunity':opportunity.type} · Details ready</p>
        {opportunity.trust_tier&&<span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${trustBadgeDetails(opportunity.trust_tier,opportunity.source_badge).className}`}>{trustBadgeDetails(opportunity.trust_tier,opportunity.source_badge).label}</span>}
      </div>
      <h1 className="mt-3 text-3xl font-semibold">{opportunity.title||'Title not stated'}</h1>
      <p className="mt-2 text-muted-foreground">{opportunity.organization||'Organisation unknown'}</p>
      {opportunity.risk_signals&&opportunity.risk_signals.length>0&&<div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800"><p className="font-semibold text-sm">Security Alert: Risk signals detected in source</p><ul className="mt-2 list-disc pl-4 space-y-1">{opportunity.risk_signals.map((sig,i)=><li key={i}>{sig}</li>)}</ul><p className="mt-2 text-[11px] text-red-700">Automatic actions are strictly blocked pending explicit manual review.</p></div>}
      <Card className="mt-6">
        <dl className="grid gap-6 sm:grid-cols-2">
          <div><dt className="text-sm text-muted-foreground">Deadline</dt><dd className="mt-1 font-semibold">{deadlineLabel(opportunity.deadline)}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Location</dt><dd className="mt-1 font-semibold">{opportunity.location||'Unknown'}</dd></div>
        </dl>
        {opportunity.description&&<p className="mt-6 whitespace-pre-wrap leading-relaxed">{opportunity.description}</p>}
        <p className="mt-5 text-sm"><span className="text-muted-foreground">Skills stated: </span>{opportunity.skills.length?opportunity.skills.join(', '):'Not stated'}</p>
        {opportunity.application_url?<a className="mt-5 inline-flex items-center gap-1 font-semibold text-primary hover:underline" href={opportunity.application_url} target="_blank" rel="noopener noreferrer">Open application page<ArrowUpRight className="size-4"/></a>:<p className="mt-5 text-sm text-muted-foreground">Application link not stated.</p>}
      </Card>
      <DecisionToolbar opportunityId={id} initialDecision={decisionRes.data}/>
      <DecisionPanel match={match} id={id}/>
      <ActionStatus matchId={match?.id} opportunityId={id}/>
      {opportunity.ambiguity_flags.length>0&&<Card className="mt-5 border-amber-200 bg-amber-50"><h2 className="font-semibold">Points to clarify</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-amber-900">{opportunity.ambiguity_flags.map(flag=><li key={flag}>{flagLabel(flag)}</li>)}</ul></Card>}
      <Card className="mt-5">
        <h2 className="text-xl font-semibold">Stated requirements</h2>
        {!requirements.data?.length?<p className="mt-3 text-sm text-muted-foreground">No explicit requirements were extracted. This does not establish eligibility.</p>:<ul className="mt-4 space-y-5">{(requirements.data as Requirement[]).map(r=><li key={r.id}><div className="flex flex-wrap items-center gap-2"><span className="text-xs uppercase text-muted-foreground">{r.kind.replaceAll('_',' ')}</span><span className="rounded-full bg-muted px-2 py-1 text-xs">{r.mandatory?'Mandatory in source':'Preference or context'}</span></div><p className="mt-2 font-medium">{r.value}</p><blockquote className="mt-2 border-l-2 border-primary/30 pl-3 text-sm text-muted-foreground">“{r.evidence_snippet}”</blockquote></li>)}</ul>}
      </Card>
      <div className="mt-8">
        <h2 className="text-xl font-semibold">Sources and evidence</h2>
        <p className="mt-2 text-sm text-muted-foreground">Quoted passages were checked against the prepared source text. Review the announcement for context.</p>
        {provenance.map(source=>{
          const submission=submissions.data?.find(r=>r.id===source.raw_item_id);
          return (
            <Card key={source.raw_item_id} className="mt-4">
              <p className="text-sm font-semibold">{submission?.source_type==='url'?'Website announcement':submission?.source_type==='email'?'Forwarded email':'Pasted announcement'}</p>
              {submission?.final_url&&<a href={submission.final_url} target="_blank" rel="noopener noreferrer" className="mt-2 block break-all text-xs text-primary hover:underline">{submission.final_url}</a>}
              <p className="mt-2 text-xs text-muted-foreground">Saved {submission?formatDate(submission.created_at):'earlier'}{submission?.fetched_at?` · Read ${formatDate(submission.fetched_at)}`:''}</p>
              <ul className="mt-4 space-y-4">{(source.extracted_json.evidence||[]).map((e,index)=><li key={index}><p className="text-xs uppercase text-muted-foreground">{e.field.replaceAll('_',' ')}</p><blockquote className="mt-1 border-l-2 border-primary/30 pl-3 text-sm">“{e.quote}”</blockquote></li>)}</ul>
              <details className="mt-5"><summary className="cursor-pointer text-sm font-medium">Read source text</summary><p className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed">{submission?.cleaned_text||submission?.raw_content||'Source unavailable'}</p></details>
              <details className="mt-3"><summary className="cursor-pointer text-xs text-muted-foreground">Original submission</summary><p className="mt-2 break-words whitespace-pre-wrap text-xs">{submission?.raw_content}</p></details>
            </Card>
          );
        })}
      </div>
    </>
  );
}
