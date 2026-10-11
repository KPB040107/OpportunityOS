import { requireUser } from '@/lib/auth';
import { ProfileForm } from './form';
export default async function ProfilePage() {
  const {supabase,user} = await requireUser();
  const [profile,skills] = await Promise.all([supabase.from('profiles').select('*').eq('user_id',user.id).maybeSingle(),supabase.from('profile_skills').select('level,skills(name)').eq('user_id',user.id)]);
  if(profile.error || skills.error) throw new Error('Profile data unavailable');
  const skillRows=(skills.data || []).map(row=>({name:(row.skills as unknown as {name:string}).name,level:row.level}));
  return <><p className="text-sm font-semibold uppercase tracking-widest text-primary">Make it yours</p><h1 className="mt-2 text-3xl font-semibold">My profile</h1><p className="mt-3 mb-8 text-muted-foreground">Give your agent context. Leave anything you don’t know blank.</p><ProfileForm profile={profile.data} skills={skillRows}/></>;
}
