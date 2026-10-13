'use server';
import {revalidatePath} from 'next/cache';
import {requireUser} from '@/lib/auth';
import {z} from 'zod';
export async function updateApplicationStatus(id:string,status:string,notes?:string){
 const parsed=z.object({id:z.uuid(),status:z.enum(['saved','to_apply','applied','assessment','interview','offer','rejected']),notes:z.string().max(2000).optional()}).safeParse({id,status,notes});if(!parsed.success)throw new Error('Invalid application update');
 const {supabase}=await requireUser();const {data,error}=await supabase.rpc('update_my_application',{p_id:id,p_status:status,p_notes:notes??null});if(error||!data)throw new Error('Application update was not confirmed');
 revalidatePath('/applications');revalidatePath('/activity');return {success:true};
}
