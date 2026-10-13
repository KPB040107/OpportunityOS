'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
export function LiveUpdates({userId}:{userId:string}) {
  const router=useRouter();
  useEffect(()=>{
    const supabase=createClient(); let timer:ReturnType<typeof setTimeout>;
    const refresh=()=>{ clearTimeout(timer); timer=setTimeout(()=>router.refresh(),250); };
    const channel=supabase.channel(`workspace:${userId}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'raw_items',filter:`user_id=eq.${userId}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'opportunities',filter:`user_id=eq.${userId}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'matches',filter:`user_id=eq.${userId}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'actions',filter:`user_id=eq.${userId}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'approvals',filter:`user_id=eq.${userId}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'applications',filter:`user_id=eq.${userId}`},refresh)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'events',filter:`user_id=eq.${userId}`},refresh).subscribe();
    const poll=setInterval(refresh,15000);
    return ()=>{clearInterval(poll);clearTimeout(timer);void supabase.removeChannel(channel);};
  },[router,userId]);
  return null;
}
