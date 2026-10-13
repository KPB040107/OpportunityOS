import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {Card} from '@/components/ui/card';
import {LiveUpdates} from '@/components/live-updates';
import {ResolveButtons} from '../resolve-button';
import {formatDate} from '@/lib/utils';
import {requestTime} from '@/lib/server-clock';
import {RetryWork} from '@/components/retry-work';
import {z} from 'zod';
export default async function ApprovalConfirmation({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{revision?:string}>}){
 const {id}=await params,{revision}=await searchParams,supabase=await createClient(),{data:{user}}=await supabase.auth.getUser();
 if(!user)redirect('/login?next='+encodeURIComponent(`/approvals/${id}?revision=${revision||''}`));
 if(!z.uuid().safeParse(id).success)notFound();
 const {data,error}=await supabase.from('approvals').select('id,reason,status,match_revision,expires_at,requires_information,resume_status').eq('id',id).eq('user_id',user.id).maybeSingle();
 if(error)throw new Error('Review unavailable');if(!data)notFound();
 const stale=Number(revision)!==data.match_revision;
 const checkedAt=await requestTime();
 return <><LiveUpdates userId={user.id}/><Link href="/approvals">Back to reviews</Link><Card className="mt-5"><h1 className="text-2xl font-semibold">Confirm your decision</h1><p className="mt-3">{data.reason}</p><p className="mt-3 text-sm">Status: {data.status} · Execution: {data.resume_status} · Expires {formatDate(data.expires_at)}</p>{stale?<p role="alert">This link refers to an older evaluation. Open the current review from your Approval Center.</p>:data.status==='pending'?<div className="mt-5"><ResolveButtons approvalId={id} revision={data.match_revision} requiresInformation={data.requires_information} expired={new Date(data.expires_at).getTime()<=checkedAt}/></div>:<p className="mt-5">This review has already been resolved.</p>}{data.resume_status==='failed'&&!stale&&new Date(data.expires_at).getTime()>checkedAt&&<RetryWork id={id} kind="resume"/>}<p className="mt-4 text-xs">Opening this page makes no decision. Applications are never submitted automatically.</p></Card></>;
}
