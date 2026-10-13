'use client';
import {useState,useTransition} from 'react';
import {resolveApprovalAction} from './actions';
import {Button} from '@/components/ui/button';
import type {FormState} from '@/lib/types';
export function ResolveButtons({approvalId,revision,requiresInformation=false,expired=false}:{approvalId:string;revision:number;requiresInformation?:boolean;expired?:boolean}){
 const [pending,start]=useTransition(),[state,setState]=useState<FormState>({}),[reason,setReason]=useState('');
 const decide=(outcome:'approved'|'rejected')=>start(async()=>{try{setState(await resolveApprovalAction(approvalId,revision,outcome,reason));}catch{setState({error:'Could not confirm the decision. Refresh and check before retrying.'});}});
 return <div className="space-y-3"><label className="block text-xs">Reason or feedback (optional)<textarea aria-label="Review feedback" maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)} className="mt-1 w-full rounded border p-2"/></label>{requiresInformation&&<p className="text-sm">Correct missing facts in your profile or submit clearer source text, then wait for reevaluation. Approval cannot waive eligibility.</p>}<div className="flex gap-2"><Button size="sm" disabled={pending||requiresInformation||expired} onClick={()=>decide('approved')}>Approve permitted actions</Button><Button size="sm" variant="outline" disabled={pending||expired} onClick={()=>decide('rejected')}>Reject</Button></div>{state.error&&<p role="alert" className="text-sm text-red-800">{state.error}</p>}{state.success&&<p role="status" className="text-sm text-primary">{state.success}</p>}</div>;
}
