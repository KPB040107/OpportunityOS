import Link from 'next/link';
import {Card} from '@/components/ui/card';
import {componentLabels,evaluationError,type Match} from '@/lib/decisions';
import {EvaluationRetry} from '@/app/(workspace)/opportunities/evaluation-retry';

export function DecisionSummary({match}:{match:Match|undefined}){
 if(!match||match.status==='queued'||match.status==='processing')
   return <p className="mt-3 text-sm text-muted-foreground">{match?.status==='processing'?'Checking your profile and matching evidence…':'Awaiting profile evaluation…'}</p>;
 if(match.status==='failed')
   return <p className="mt-3 text-sm text-red-800">{evaluationError[match.error_code||'']||'Evaluation needs attention. No decision was made.'}</p>;

 const isInsufficient = match.eligibility_status === 'UNKNOWN' ||
   match.reason_codes?.includes('UNKNOWN_ELIGIBILITY') ||
   (match.match_score === 0 && (!match.confidence || match.confidence === 0));

 const sanitizedExplanation = isInsufficient && match.explanation
   ? match.explanation
       .replace(/\s*Match score\s+[\d.]+\/100;?/gi, '')
       .replace(/\s*Confidence\s+[\d.]+%?;?/gi, '')
       .replace(/\s*confidence\s+[\d.]+%?;?/gi, '')
       .trim()
   : match.explanation;

 return (
   <div className="mt-4">
     <div className="flex flex-wrap items-center gap-2">
       <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
         match.decision==='ACT'?'bg-emerald-100 text-emerald-900':match.decision==='ASK'?'bg-amber-100 text-amber-900':'bg-slate-100 text-slate-700'
       }`}>
         {match.decision}
       </span>
       {isInsufficient ? (
         <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-medium text-amber-900">
           Insufficient information to score
         </span>
       ) : match.match_score === null ? (
         <span className="text-xs text-muted-foreground">Matching skipped</span>
       ) : (
         <span className="text-xs text-muted-foreground">
           Match {match.match_score}/100 · Confidence {Math.round((match.confidence||0)*100)}%
         </span>
       )}
     </div>
     <p className="mt-2 text-sm">{sanitizedExplanation}</p>
   </div>
 );
}

export function DecisionPanel({match,id}:{match:Match|undefined;id:string}){
 const isInsufficient = match?.eligibility_status === 'UNKNOWN' ||
   match?.reason_codes?.includes('UNKNOWN_ELIGIBILITY') ||
   (match?.match_score === 0 && (!match?.confidence || match?.confidence === 0));

 return (
   <Card className="mt-5">
     <h2 className="text-xl font-semibold">Your agent’s decision</h2>
     <DecisionSummary match={match}/>
     {match?.status==='failed'&&match.retry_count<2&&<EvaluationRetry id={id}/>}
     {match?.status==='complete'&&<>
       <p className="mt-3 text-xs text-muted-foreground">
         {match.mode} mode · {match.policy_version}. {
           match.decision==='ACT'
             ?'Permitted actions are queued. Check their actual results below.'
             :match.decision==='ASK'
             ? (isInsufficient
                 ? 'Eligibility is UNKNOWN due to missing facts. Review details below or update your profile.'
                 : 'Needs your explicit review in the Approval Center before acting.')
             :'Filtered with reasons; no actions were created.'
         }
       </p>
       <h3 className="mt-6 font-semibold">Eligibility: {match.eligibility_status}</h3>
       <ul className="mt-3 space-y-4">
         {(match.eligibility_checks||[]).map((c,i)=>(
           <li key={i}>
             <p className="text-sm">
               <strong>{c.status}</strong> · {c.kind.replaceAll('_',' ')} — {c.reason}
             </p>
             {c.evidence&&<blockquote className="mt-1 border-l-2 border-primary/30 pl-3 text-xs text-muted-foreground">{c.evidence}</blockquote>}
           </li>
         ))}
       </ul>
       {isInsufficient ? (
         <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
           <h4 className="text-sm font-semibold text-amber-950">Scoring Not Evaluated · Verification Needed</h4>
           <p className="mt-1 text-xs text-amber-900 leading-relaxed">
             This listing did not contain sufficient verifiable requirements or facts to compute a meaningful match score.
             Numerical scores are only calculated when mandatory criteria and profile evidence can be evaluated.
           </p>
           {(() => {
             const unknownChecks = (match.eligibility_checks || []).filter(c => c.status === 'UNKNOWN');
             if (!unknownChecks.length) return null;
             return (
               <div className="mt-3 pt-3 border-t border-amber-200/60">
                 <p className="text-xs font-semibold text-amber-950">Eligibility checks requiring verification:</p>
                 <ul className="mt-1.5 list-disc pl-4 space-y-1 text-xs text-amber-900">
                   {unknownChecks.map((c, i) => (
                     <li key={i}>
                       <strong className="capitalize">{c.kind.replaceAll('_', ' ')}:</strong> {c.reason}
                     </li>
                   ))}
                 </ul>
               </div>
             );
           })()}
         </div>
       ) : match.component_scores && (
         <>
           <h3 className="mt-6 font-semibold">How the match score was calculated</h3>
           <div className="mt-3 overflow-x-auto">
             <table className="w-full text-left text-sm">
               <thead>
                 <tr className="border-b">
                   <th className="py-2">Component</th>
                   <th>Fit</th>
                   <th>Weight</th>
                   <th>Points</th>
                 </tr>
               </thead>
               <tbody>
                 {Object.entries(match.component_scores).map(([k,v])=>(
                   <tr key={k} className="border-b border-border">
                     <td className="py-2">{componentLabels[k]||k}</td>
                     <td>{v.value===null?'Unknown':`${Math.round(v.value*100)}%`}</td>
                     <td>{v.weight}%</td>
                     <td>{v.points}</td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
           <p className="mt-2 text-xs text-muted-foreground">Unknown components earn zero points. The weights stay fixed.</p>
         </>
       )}
       {match.confidence_inputs&&!isInsufficient&&(
         <>
           <h3 className="mt-6 font-semibold">Confidence inputs</h3>
           <p className="mt-2 text-sm text-muted-foreground">
             Completeness {Math.round(match.confidence_inputs.completeness*100)}% (30% weight) · Verified evidence {Math.round(match.confidence_inputs.verified_evidence*100)}% (30%) · Clarity {Math.round(match.confidence_inputs.clarity*100)}% (25%) · Model confidence {Math.round(match.confidence_inputs.model_confidence*100)}% (15%). Final confidence cannot exceed the lower confidence reported by extraction and matching.
           </p>
         </>
       )}
       {!!match.semantic_evidence?.length&&(
         <>
           <h3 className="mt-6 font-semibold">Matching evidence</h3>
           <ul className="mt-3 space-y-3">
             {match.semantic_evidence.map((e,i)=>(
               <li key={i} className="text-sm">
                 <p className="font-medium">{componentLabels[e.component]||e.component}</p>
                 <p className="mt-1 text-muted-foreground">Profile: “{e.profile_quote}”</p>
                 <blockquote className="mt-1 border-l-2 border-primary/30 pl-3">Source: “{e.opportunity_quote}”</blockquote>
               </li>
             ))}
           </ul>
         </>
       )}
       <p className="mt-5 text-sm">
         <Link href="/profile" className="font-semibold text-primary hover:underline">Update your profile or autonomy mode</Link> to reevaluate your opportunities.
       </p>
     </>}
   </Card>
 );
}
