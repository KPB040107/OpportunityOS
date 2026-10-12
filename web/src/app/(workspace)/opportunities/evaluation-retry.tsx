'use client';
import {useActionState} from 'react';
import {Button} from '@/components/ui/button';
import {retryEvaluation} from './evaluation-actions';
export function EvaluationRetry({id}:{id:string}){
 const [state,action,pending]=useActionState(retryEvaluation,{});
 return <form action={action} className="mt-4"><input type="hidden" name="opportunity_id" value={id}/><Button size="sm" variant="outline" disabled={pending}>{pending?'Requesting…':'Retry evaluation'}</Button>{state.error&&<p role="alert" className="mt-2 text-sm text-red-800">{state.error}</p>}{state.success&&<p role="status" className="mt-2 text-sm text-primary">{state.success}</p>}</form>;
}
