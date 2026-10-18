'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/types';
import { signupErrorMessage } from '@/lib/auth-errors';

export async function authenticate(_state: FormState, form: FormData): Promise<FormState> {
  const mode = form.get('mode');
  const parsed = z
    .object({
      email: z.string().email(),
      password: z.string().min(mode === 'signup' ? 8 : 1).max(128)
    })
    .safeParse({ email: form.get('email'), password: form.get('password') });

  if (!parsed.success) {
    return {
      error:
        mode === 'signup'
          ? 'Enter a valid email and a password with at least 8 characters.'
          : 'Enter your account email and password.'
    };
  }

  const supabase = await createClient();

  if (mode === 'signup') {
    const { data, error } = await supabase.auth.signUp({
      ...parsed.data,
      options: { emailRedirectTo: `${process.env.APP_ORIGIN || 'http://localhost:3000'}/auth/callback` }
    });

    if (error) {
      console.error('Trajectory signup failed', {
        code: error.code && /^[a-z_]{1,64}$/.test(error.code) ? error.code : 'unknown',
        status: error.status
      });
      return { error: signupErrorMessage(error) };
    }

    if (!data.session) {
      return { success: 'Check your email to confirm your account, then sign in here.' };
    }

    redirect('/onboarding/profile');
  }

  const { data: authData, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: 'Could not sign in. Check your email and password, and confirm your account email first.' };
  }

  // Check if student has already confirmed their profile
  const { data: userProfile } = await supabase
    .from('profiles')
    .select('revision')
    .eq('user_id', authData.user.id)
    .maybeSingle();

  const next = String(form.get('next') || '');
  const isExplicitNext =
    next &&
    next !== '/inbox' &&
    next !== '/home' &&
    /^\/(?:home|opportunities|approvals|plan|rules|sources|profile|capture|activity|applications|onboarding)(?:\/[0-9a-f-]{36})?(?:\?[a-zA-Z0-9_=&-]+)?$/.test(
      next
    );

  if (!userProfile || !userProfile.revision || userProfile.revision === 0) {
    redirect('/onboarding/profile');
  }

  redirect(isExplicitNext ? next : '/home');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
