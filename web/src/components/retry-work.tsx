'use client';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {retryWork} from '@/lib/operations';
export function RetryWork({id,kind}:{id:string;kind:'action'|'resume'}) {
 const [pending,start]=useTransition(),[message,setMessage]=useState(''),router=useRouter();
 return <div className="mt-2"><button disabled={pending} className="rounded border px-3 py-1 text-sm disabled:opacity-50" onClick={()=>start(async()=>{try{const result=await retryWork(id,kind);setMessage(result.error||result.success||'');if(result.success)router.refresh();}catch{setMessage('Could not confirm the retry. Refresh before trying again.');}})}>{pending?'Queuing retry…':'Retry safely'}</button>{message&&<p role="status" className="mt-2 text-sm">{message}</p>}</div>;
}
