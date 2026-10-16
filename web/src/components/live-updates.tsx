'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
export function LiveUpdates({userId}:{userId:string}) {
  const router=useRouter();
  useEffect(()=>{
    const supabase=createClient(); let timer:ReturnType<typeof setTimeout>|undefined;
    // Coalesce batch updates without repeatedly rebuilding the whole page.
    const refresh=()=>{
      if(document.visibilityState!=='visible' || timer) return;
      timer=setTimeout(()=>{timer=undefined;if(document.visibilityState==='visible')router.refresh();},1500);
    };
    const channel=supabase.channel(`workspace:${userId}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'raw_items',filter:`user_id=eq.${userId}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'opportunities',filter:`user_id=eq.${userId}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'matches',filter:`user_id=eq.${userId}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'actions',filter:`user_id=eq.${userId}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'approvals',filter:`user_id=eq.${userId}`},refresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'applications',filter:`user_id=eq.${userId}`},refresh)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'events',filter:`user_id=eq.${userId}`},refresh).subscribe();
    const poll=setInterval(refresh,60000);
    document.addEventListener('visibilitychange',refresh);
    return ()=>{clearInterval(poll);clearTimeout(timer);document.removeEventListener('visibilitychange',refresh);void supabase.removeChannel(channel);};
  },[router,userId]);
  return null;
}
