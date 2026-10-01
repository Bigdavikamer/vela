import * as Linking from 'expo-linking';
import { z } from 'zod';

import { qk, queryClient } from '../lib/queryClient';
import { supabase, toVelaError, VelaError } from '../lib/supabase';
import { track } from './analytics';

/**
 * Authentication.
 *
 * Supabase returns deliberately vague errors for some flows (to avoid leaking
 * whether an account exists). We keep that property but translate the wording
 * into something a student can act on.
 */

export const emailSchema = z.string().trim().toLowerCase().email();
export const passwordSchema = z.string().min(8);

export type AuthResult = { needsConfirmation: boolean };

export async function signUp(input: {
  email: string;
  password: string;
  displayName: string;
  uiLocale: string;
}): Promise<AuthResult> {
  const email = emailSchema.parse(input.email);
  passwordSchema.parse(input.password);

  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: { display_name: input.displayName.trim(), ui_locale: input.uiLocale },
      emailRedirectTo: Linking.createURL('/auth/callback'),
    },
  });

  if (error) throw mapAuthError(error);

  // With email confirmation on, Supabase returns a user but no session.
  return { needsConfirmation: !data.session };
}

export async function signIn(input: { email: string; password: string }): Promise<void> {
  const email = emailSchema.parse(input.email);

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
  });

  if (error) throw mapAuthError(error);
}

/** Passwordless sign-in. Also the recovery path when a password is forgotten. */
export async function sendMagicLink(email: string): Promise<void> {
  const parsed = emailSchema.parse(email);
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed,
    options: { emailRedirectTo: Linking.createURL('/auth/callback') },
  });
  if (error) throw mapAuthError(error);
}

export async function sendPasswordReset(email: string): Promise<void> {
  const parsed = emailSchema.parse(email);
  const { error } = await supabase.auth.resetPasswordForEmail(parsed, {
    redirectTo: Linking.createURL('/auth/reset'),
  });
  if (error) throw mapAuthError(error);
}

export async function updatePassword(password: string): Promise<void> {
  passwordSchema.parse(password);
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw mapAuthError(error);
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw mapAuthError(error);
}

/**
 * Deletes the account and everything in it.
 *
 * Runs server-side through a SECURITY DEFINER function that deletes only
 * `auth.uid()`; every user-owned table cascades from `auth.users`, so this
 * cannot half-finish and leave orphaned recordings behind.
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw toVelaError(error);
  track('account_deleted');
  await supabase.auth.signOut();
}

function mapAuthError(error: { message: string; status?: number; code?: string }): VelaError {
  const message = error.message.toLowerCase();
  const code = error.code ?? '';

  if (message.includes('invalid login credentials')) {
    return new VelaError('That email and password do not match.', 'forbidden', false, error);
  }
  if (message.includes('email not confirmed')) {
    return new VelaError(
      'Confirm your email first — check your inbox for the link we sent.',
      'forbidden',
      false,
      error,
    );
  }
  if (message.includes('already registered') || message.includes('already been registered')) {
    return new VelaError(
      'There is already an account with that email. Try signing in instead.',
      'forbidden',
      false,
      error,
    );
  }
  // Two very different 429s wear the same status code, and telling them apart
  // matters: one clears in seconds, the other is a project-wide hourly quota on
  // outbound email that no amount of retrying will fix.
  if (message.includes('email rate limit') || code === 'over_email_send_rate_limit') {
    return new VelaError(
      'Vela could not send the confirmation email — this project has hit its hourly email limit. ' +
        'Turn off email confirmation in Supabase (Authentication → Sign In / Providers → Email) ' +
        'or connect an SMTP provider.',
      'rate_limited',
      false,
      error,
    );
  }
  if (message.includes('rate limit') || error.status === 429) {
    return new VelaError(
      'Too many attempts in a row. Wait a minute and try again.',
      'rate_limited',
      true,
      error,
    );
  }
  if (message.includes('password')) {
    return new VelaError('Use a password of at least 8 characters.', 'unknown', false, error);
  }

  return toVelaError(error);
}

/** Marks onboarding finished so the route guard stops sending them back. */
export async function completeOnboarding(input: {
  educationLevel?: string | null;
  studyStyle?: string | null;
  contentLanguage?: string | null;
}): Promise<void> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new VelaError('Sign in to continue.', 'unauthenticated', false);

  const { error } = await supabase
    .from('profiles')
    .update({
      onboarding_completed_at: new Date().toISOString(),
      education_level: input.educationLevel ?? null,
      study_style: input.studyStyle ?? null,
      content_language: input.contentLanguage ?? null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
    })
    .eq('id', data.user.id);

  if (error) throw toVelaError(error);

  // Prime the route guard's cache entry SYNCHRONOUSLY before returning. The
  // caller navigates out of the onboarding group immediately afterwards, and if
  // the guard still believed onboarding was incomplete it would replace that
  // navigation with /(onboarding)/subject — the loop this line exists to
  // prevent. An invalidate() would race; setQueryData cannot.
  queryClient.setQueryData(qk.onboarding(data.user.id), true);

  track('onboarding_completed');
}
