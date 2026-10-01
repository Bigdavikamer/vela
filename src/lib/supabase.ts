import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import type { Database } from '../types/database';
import { config } from './config';

/**
 * The single Supabase client.
 *
 * Sessions persist in AsyncStorage so a student who force-quits mid-lecture is
 * still signed in when they come back. Refresh is tied to app foreground state:
 * without this, a token can expire while the app is backgrounded and the next
 * request fails with a confusing 401 instead of quietly refreshing.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  config.supabaseUrl,
  config.supabaseAnonKey,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // React Native has no URL bar to parse a session out of.
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'x-vela-platform': Platform.OS,
        'x-vela-version': config.appVersion,
      },
    },
  },
);

let appStateSubscription: { remove: () => void } | null = null;

/** Called once from the root layout. Idempotent. */
export function startSupabaseAutoRefresh() {
  if (appStateSubscription) return;
  appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
  void supabase.auth.startAutoRefresh();
}

export function stopSupabaseAutoRefresh() {
  appStateSubscription?.remove();
  appStateSubscription = null;
  void supabase.auth.stopAutoRefresh();
}

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A failure the UI can actually act on. Every data call funnels through this so
 * screens never have to interpret a raw PostgREST error, and the user never
 * sees a bare code.
 */
export class VelaError extends Error {
  constructor(
    message: string,
    readonly code: VelaErrorCode,
    /** true when retrying the identical request could plausibly succeed */
    readonly retryable: boolean,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'VelaError';
  }
}

export type VelaErrorCode =
  | 'offline'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'provider_unconfigured'
  | 'timeout'
  | 'server'
  | 'unknown';

/** Maps transport and PostgREST failures onto something a human can read. */
export function toVelaError(error: unknown): VelaError {
  if (error instanceof VelaError) return error;

  const raw = error as { message?: string; code?: string; status?: number; name?: string };
  const message = raw?.message ?? '';
  const status = raw?.status;

  if (raw?.name === 'AbortError' || /timeout/i.test(message)) {
    return new VelaError('That took too long to respond.', 'timeout', true, error);
  }
  if (/network request failed|fetch failed|Failed to fetch/i.test(message)) {
    return new VelaError(
      'No connection. Your work is saved on this device and will sync when you are back online.',
      'offline',
      true,
      error,
    );
  }
  if (status === 401 || raw?.code === 'PGRST301' || /jwt|refresh token/i.test(message)) {
    return new VelaError('Your session expired. Sign in again to continue.', 'unauthenticated', false, error);
  }
  if (status === 403 || raw?.code === '42501') {
    return new VelaError('You do not have access to that.', 'forbidden', false, error);
  }
  if (status === 404 || raw?.code === 'PGRST116') {
    return new VelaError('That no longer exists.', 'not_found', false, error);
  }
  if (status === 429) {
    return new VelaError('Too many requests. Give it a moment.', 'rate_limited', true, error);
  }
  if (status && status >= 500) {
    return new VelaError('Something broke on our side. Try again.', 'server', true, error);
  }

  return new VelaError(message || 'Something unexpected happened.', 'unknown', true, error);
}

/** Unwraps a Supabase `{ data, error }` result or throws a VelaError. */
export function unwrap<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw toVelaError(result.error);
  return result.data;
}
