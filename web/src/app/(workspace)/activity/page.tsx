import { Activity as ActivityIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { LiveUpdates } from '@/components/live-updates';
import type { Activity } from '@/lib/types';
export default async function ActivityPage() {
  const {supabase,user}=await requireUser();
  const {data,error}=await supabase.from('events').select('id,stage,level,message,ts,metadata').eq('user_id',user.id).order('ts',{ascending:false}).limit(100);
  if(error) throw new Error('Activity unavailable');
  const rows=data as Activity[];
  return <><LiveUpdates userId={user.id}/><p className="text-sm font-semibold uppercase tracking-widest text-primary">The story so far</p><h1 className="mt-2 text-3xl font-semibold">Activity</h1><p className="mt-3 mb-8 text-muted-foreground">A clear record of what happened in your account. Times are shown in Asia/Kolkata.</p><Card>{!rows.length?<div className="py-10 text-center"><ActivityIcon className="mx-auto mb-4 size-8 text-primary/60"/><h2 className="font-semibold">Your story starts here</h2><p className="mt-2 text-sm text-muted-foreground">Profile saves and confirmed opportunity submissions will appear here.</p></div>:<ul className="divide-y divide-border">{rows.map(event=><li key={event.id} className="flex gap-4 py-5 first:pt-0 last:pb-0"><div className={`mt-1 flex size-9 shrink-0 items-center justify-center rounded-full ${event.level==='error'?'bg-red-50 text-red-700':'bg-muted text-primary'}`}>{event.level==='error'?<AlertCircle className="size-4"/>:<CheckCircle2 className="size-4"/>}</div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{event.message}</p><p className="mt-1 text-xs capitalize text-muted-foreground">{event.stage} · {event.level}</p></div><time dateTime={event.ts} className="text-right text-xs text-muted-foreground">{formatDate(event.ts)}</time></li>)}</ul>}</Card></>;
}
