'use server';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {requireUser} from '@/lib/auth';
import type {FormState} from '@/lib/types';
export async function resolveApprovalAction(id:string,revision:number,outcome:'approved'|'rejected',reason=''):Promise<FormState>{
 const input=z.object({id:z.uuid(),revision:z.number().int().min(0),outcome:z.enum(['approved','rejected']),reason:z.string().max(2000)}).safeParse({id,revision,outcome,reason});
 if(!input.success)return {error:'Invalid review request.'};
 const {supabase}=await requireUser();
 const {data,error}=await supabase.rpc('confirm_approval',{p_id:id,p_revision:revision,p_outcome:outcome,p_reason:reason});
 if(error)return {error:'The decision could not be recorded. Refresh and check its status.'};
 if(!data?.accepted){const reasons:Record<string,string>={ALREADY_RESOLVED:'This review was already resolved.',EXPIRED:'This review expired.',STALE:'Your profile or source changed. Wait for reevaluation.',CORRECT_INFORMATION_REQUIRED:'Correct missing facts and reevaluate before approving.',EXECUTION_UNBOUND:'This older review has no bound execution. Reevaluation is required.'};return {error:reasons[data?.reason]||'This review cannot be approved.'};}
 for(const path of ['/approvals','/applications','/inbox','/activity'])revalidatePath(path);
 return {success:'Decision recorded. The waiting execution will resume; its status will update here.'};
}
