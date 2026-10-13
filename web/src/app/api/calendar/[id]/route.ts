import {createClient} from '@/lib/supabase/server';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!/^[0-9a-f-]{36}$/.test(id))return new Response('Not found',{status:404});
 const supabase=await createClient(),{data:{user}}=await supabase.auth.getUser();if(!user)return new Response('Sign in required',{status:401});
 const {data,error}=await supabase.from('actions').select('result').eq('id',id).eq('user_id',user.id).eq('type','calendar_link').eq('status','done').maybeSingle();
 const ics=data?.result?.ics;if(error||typeof ics!=='string'||ics.length>100000)return new Response('Not found',{status:404});
 return new Response(ics,{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="opportunityos-deadline.ics"','Cache-Control':'private, no-store'}});
}
