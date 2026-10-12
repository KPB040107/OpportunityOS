'use server';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {requireUser} from '@/lib/auth';
import type {FormState} from '@/lib/types';
export async function retryEvaluation(_state:FormState,form:FormData):Promise<FormState>{
 const {supabase}=await requireUser();const id=z.uuid().safeParse(form.get('opportunity_id'));
 if(!id.success)return {error:'Opportunity not found.'};
 const {error}=await supabase.rpc('retry_evaluation',{p_id:id.data});
 if(error)return {error:'This evaluation cannot be retried. Check its status or update your profile.'};
 revalidatePath(`/opportunities/${id.data}`);revalidatePath('/inbox');revalidatePath('/activity');return {success:'Evaluation retry queued.'};
}
