import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '../lib/supabase';

type AuthState = {
  session: Session | null;
  user: User | null;
  /** false until we have asked Supabase whether a stored session exists */
  initialized: boolean;
  setSession: (session: Session | null) => void;
};

/**
 * Auth session only. Everything else about the user (profile, preferences,
 * entitlement) is server state and lives in React Query, so it stays fresh and
 * cannot drift out of sync with the database.
 */
export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  initialized: false,
  setSession: (session) => set({ session, user: session?.user ?? null, initialized: true }),
}));

let unsubscribe: (() => void) | null = null;

/**
 * Wires Supabase auth into the store. Safe to call more than once.
 * Returns a teardown function for tests.
 */
export function initAuthListener(): () => void {
  if (unsubscribe) return unsubscribe;

  // Resolve the persisted session first so the app does not flash the sign-in
  // screen for an already-authenticated user.
  void supabase.auth
    .getSession()
    .then(({ data }) => useAuthStore.getState().setSession(data.session))
    .catch(() => useAuthStore.getState().setSession(null));

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.getState().setSession(session);
  });

  unsubscribe = () => {
    data.subscription.unsubscribe();
    unsubscribe = null;
  };
  return unsubscribe;
}

export function useUserId(): string | null {
  return useAuthStore((s) => s.user?.id ?? null);
}
