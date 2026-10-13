'use server';
import {z} from 'zod';
import {requireUser} from './auth';
export async function retryWork(id:string,kind:'action'|'resume') {
 if(!z.uuid().safeParse(id).success||!['action','resume'].includes(kind))return {error:'Invalid retry request.'};
 const {supabase}=await requireUser();
 const {data,error}=await supabase.rpc(kind==='action'?'retry_my_action':'retry_my_resume',{p_id:id});
 if(error||!data)return {error:'This item cannot be retried now. Refresh and check its status.'};
 return {success:'Retry queued. Check the result before retrying again.'};
}
