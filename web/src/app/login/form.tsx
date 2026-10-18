'use client';

import { useActionState, useState } from 'react';
import { authenticate } from './actions';

export function LoginForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [state, action, pending] = useActionState(authenticate, {});

  return (
    <div className="flex flex-col gap-4">
      {/* Mode Switcher */}
      <div className="grid grid-cols-2 gap-1 p-1 border-[1.5px] border-border rounded-[12px] bg-[#F3F1EC]">
        <button
          type="button"
          onClick={() => setMode('signin')}
          aria-pressed={mode === 'signin'}
          className={`h-11 rounded-[8px] font-sans text-sm font-semibold transition-all ${
            mode === 'signin'
              ? 'bg-white text-foreground shadow-[2px_2px_0_#111111] border-[1.5px] border-border'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode('signup')}
          aria-pressed={mode === 'signup'}
          className={`h-11 rounded-[8px] font-sans text-sm font-semibold transition-all ${
            mode === 'signup'
              ? 'bg-white text-foreground shadow-[2px_2px_0_#111111] border-[1.5px] border-border'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Create account
        </button>
      </div>

      <h3 className="font-display font-bold text-2xl tracking-tight text-foreground m-0">
        {mode === 'signin' ? 'Welcome back' : 'Start your trajectory'}
      </h3>

      <form action={action} className="space-y-4">
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="next" value={next || '/onboarding/profile'} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
            College or Personal Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@college.edu"
            className="h-12 box-border px-3.5 border-[1.5px] border-border rounded-[10px] bg-white text-foreground font-sans text-base placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            minLength={mode === 'signup' ? 8 : 1}
            maxLength={128}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            placeholder="••••••••"
            className="h-12 box-border px-3.5 border-[1.5px] border-border rounded-[10px] bg-white text-foreground font-sans text-base placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          />
          {mode === 'signup' && (
            <p className="text-xs font-mono text-muted-foreground">Minimum 8 characters.</p>
          )}
        </div>

        {state.error && (
          <div role="alert" className="p-3 border-[1.5px] border-red-900 rounded-[10px] bg-danger text-danger-foreground text-xs font-medium">
            {state.error}
          </div>
        )}

        {state.success && (
          <div role="status" className="p-3 border-[1.5px] border-emerald-900 rounded-[10px] bg-emerald-50 text-emerald-900 text-xs font-medium">
            {state.success}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full flex items-center justify-center gap-2 h-[52px] border-[1.5px] border-border rounded-[12px] bg-primary shadow-hard text-primary-foreground font-sans font-bold text-base transition-all hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-hard-md active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-sm disabled:opacity-50"
        >
          {pending ? 'Verifying…' : mode === 'signin' ? 'Sign in to Trajectory →' : 'Continue to Profile →'}
        </button>

        <p className="text-center text-xs text-muted-foreground font-mono pt-1">
          Trajectory never applies without your explicit approval.
        </p>
      </form>
    </div>
  );
}
