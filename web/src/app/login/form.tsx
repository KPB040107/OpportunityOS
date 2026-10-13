'use client';
import { useActionState, useState } from 'react';
import { authenticate } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export function LoginForm({next}:{next?:string}) {
  const [mode,setMode] = useState<'signin'|'signup'>('signin');
  const [state,action,pending] = useActionState(authenticate,{});
  return <><div className="mb-7 grid grid-cols-2 rounded-xl bg-muted p-1">{(['signin','signup'] as const).map(m=><button key={m} type="button" onClick={()=>setMode(m)} className={`rounded-lg py-2 text-sm font-semibold ${mode===m?'bg-white shadow-sm':'text-muted-foreground'}`}>{m==='signin'?'Sign in':'Create account'}</button>)}</div>
    <form action={action} className="space-y-5"><input type="hidden" name="mode" value={mode}/><input type="hidden" name="next" value={next||'/inbox'}/><div className="space-y-2"><label htmlFor="email">Email address</label><Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@example.com"/></div><div className="space-y-2"><label htmlFor="password">Password</label><Input id="password" name="password" type="password" minLength={mode==='signup'?8:1} maxLength={128} autoComplete={mode==='signup'?'new-password':'current-password'} required/>{mode==='signup' && <p className="text-xs text-muted-foreground">At least 8 characters.</p>}</div>
    {state.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}{state.success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-primary">{state.success}</p>}
    <Button disabled={pending} className="w-full">{pending?'Please wait…':mode==='signin'?'Sign in to your inbox':'Create your account'}</Button></form></>;
}
