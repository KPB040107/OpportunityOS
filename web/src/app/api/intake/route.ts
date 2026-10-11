import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { intakeSchema, publicUrl } from '@/lib/validation';
import { z } from 'zod';
const resultSchema=z.object({raw_item_id:z.uuid(),processing_status:z.enum(['queued','processing','understood','failed']),was_created:z.boolean()});
export async function POST(request:NextRequest) {
  const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
  if(request.headers.get('origin')!==origin) return NextResponse.json({error:'Request not allowed.'},{status:403});
  const supabase=await createClient();
  const {data:{user},error}=await supabase.auth.getUser();
  if(error || !user) return NextResponse.json({error:'Please sign in again.'},{status:401});
  if(!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({error:'Use a JSON request.'},{status:415});
  const reader=request.body?.getReader(); if(!reader) return NextResponse.json({error:'Content required.'},{status:400});
  const chunks:Uint8Array[]=[]; let size=0;
  try {
    while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>90000) { await reader.cancel(); return NextResponse.json({error:'Content is too long.'},{status:413}); } chunks.push(value); }
  } catch { return NextResponse.json({error:'Could not read the submission.'},{status:400}); }
  let body:unknown;
  try { body=JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return NextResponse.json({error:'Invalid submission.'},{status:400}); }
  const parsed=intakeSchema.safeParse(body);
  if(!parsed.success) return NextResponse.json({error:parsed.error.issues[0].message},{status:400});
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) return NextResponse.json({error:'Please sign in again.'},{status:401});
  const url=process.env.N8N_INGEST_URL;
  if(!url) return NextResponse.json({error:'Intake is not connected yet. Please try later.'},{status:503});
  const content=parsed.data.source_type==='url'?publicUrl(parsed.data.content):parsed.data.content;
  try {
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({...parsed.data,content}),signal:AbortSignal.timeout(20000),cache:'no-store',redirect:'error'});
    const result=await response.json();
    if(!response.ok || !resultSchema.safeParse(result).success) {
      return NextResponse.json({error:response.status===401?'Please sign in again.':'The workflow could not confirm the save. Check your inbox before retrying.'},{status:response.status===401?401:502});
    }
    return NextResponse.json({id:result.raw_item_id,status:result.processing_status},{status:201});
  } catch { return NextResponse.json({error:'The workflow did not confirm the save. Check your inbox, then retry this same submission if needed.'},{status:503}); }
}
