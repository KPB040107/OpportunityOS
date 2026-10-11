'use server';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {requireUser} from '@/lib/auth';
import type {FormState} from '@/lib/types';
export async function retryAnalysis(_state:FormState,form:FormData):Promise<FormState>{
  const id=z.uuid().safeParse(form.get('raw_item_id'));
  if(!id.success)return {error:'Invalid submission.'};
  const {supabase}=await requireUser();
  const {error}=await supabase.rpc('retry_understand_item',{p_id:id.data});
  if(error)return {error:'Could not retry this submission. Only the original failed item can be retried, up to twice. You can also submit corrected text.'};
  revalidatePath('/inbox');revalidatePath('/activity');
  return {success:'Retry queued. Analysis will update here when it finishes.'};
}
