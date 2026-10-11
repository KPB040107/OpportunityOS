'use client';
import {useActionState} from 'react';
import {Button} from '@/components/ui/button';
import {retryAnalysis} from './actions';
export function RetryForm({id}:{id:string}){
  const [state,action,pending]=useActionState(retryAnalysis,{});
  return <form action={action} className="mt-3"><input type="hidden" name="raw_item_id" value={id}/><Button size="sm" variant="outline" disabled={pending}>{pending?'Queuing…':'Retry analysis'}</Button>{state.error&&<p role="alert" className="mt-2 text-sm text-red-800">{state.error}</p>}{state.success&&<p role="status" className="mt-2 text-sm text-primary">{state.success}</p>}</form>;
}
