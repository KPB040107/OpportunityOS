'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { profileSchema, skillSchema, splitSkillNames } from '@/lib/validation';
import type { FormState } from '@/lib/types';
export async function saveProfile(_state:FormState,form:FormData):Promise<FormState> {
  const {supabase} = await requireUser();
  const mode=z.enum(['cautious','balanced','autopilot']).safeParse(form.get('autonomy_mode'));
  if(!mode.success)return {error:'Please choose a valid autonomy mode.'};
  const profile = profileSchema.safeParse({display_name:form.get('display_name'),degree:form.get('degree'),branch:form.get('branch'),academic_year:form.get('academic_year'),graduation_year:form.get('graduation_year'),cgpa:form.get('cgpa'),career_goals:form.get('career_goals'),interest_types:form.getAll('interest_types'),preferred_locations:String(form.get('preferred_locations') || '').split(',').map(s=>s.trim()).filter(Boolean)});
  let rawSkills:unknown;
  try { rawSkills=JSON.parse(String(form.get('skills'))); } catch { return {error:'Please check your skill entries.'}; }
  const entered=z.array(skillSchema).max(30).safeParse(rawSkills);
  if(!profile.success || !entered.success) return {error:'Please check the year, CGPA, and text fields. CGPA must be between 0 and 10.'};
  const skills=z.array(skillSchema).max(30).safeParse(splitSkillNames(entered.data));
  if(!skills.success)return {error:'Please keep the total number of separate skills at 30 or fewer.'};
  const {error}=await supabase.rpc('save_profile',{p_profile:profile.data,p_skills:skills.data});
  if(error) return {error:'Your profile could not be saved. Please try again.'};
  const modeResult=await supabase.rpc('save_autonomy_mode',{p_mode:mode.data});
  if(modeResult.error)return {error:'Profile saved, but your autonomy mode could not be saved. Please try again.'};
  revalidatePath('/profile'); revalidatePath('/inbox'); revalidatePath('/activity');
  return {success:'Your profile is saved.'};
}
