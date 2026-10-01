import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { FunctionError } from './http.ts';

/**
 * Two clients, two purposes:
 *
 *  - `userClient` carries the caller's JWT, so RLS applies. Anything that reads
 *    or writes on behalf of the student goes through it. This is what makes a
 *    bug in a function unable to leak another user's material.
 *  - `adminClient` uses the service role and bypasses RLS. Reserved for work
 *    the user cannot authorise themselves: writing entitlements from a Stripe
 *    webhook, and pipeline writes that continue after the request returns.
 *    Every admin query in this codebase filters by user_id explicitly.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function userClient(authHeader: string): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AuthedContext = {
  userId: string;
  db: SupabaseClient;
  admin: SupabaseClient;
  authHeader: string;
};

/** Verifies the caller's JWT and returns both clients. */
export async function authenticate(req: Request): Promise<AuthedContext> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new FunctionError('unauthenticated', 'Sign in to continue.');
  }

  const db = userClient(authHeader);
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) {
    throw new FunctionError('unauthenticated', 'Your session expired. Sign in again.');
  }

  return { userId: data.user.id, db, admin: adminClient(), authHeader };
}

/** Parses and shallow-validates a JSON body. */
export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new FunctionError('bad_request', 'Expected a JSON body.');
  }
}
