import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { resolveDeviceLocale, setLocale, type LocaleCode } from '../i18n';
import { supabase } from '../lib/supabase';
import type { ThemePreference } from '../theme/ThemeProvider';
import type { Database } from '../types/database';

export type AmbienceKey =
  | 'none' | 'rain' | 'library' | 'fireplace' | 'cafe' | 'ocean' | 'night' | 'forest';

export type Preferences = {
  theme: ThemePreference;
  reduceMotion: boolean;
  haptics: boolean;
  fontScale: number;
  uiLocale: LocaleCode;
  /** null = keep material in whatever language the source is in */
  contentLanguage: string | null;
  ambience: AmbienceKey;
  sessionMinutes: number;
  notifyReviewDue: boolean;
  notifyExamCountdown: boolean;
  notifyProcessingDone: boolean;
  dailyReviewHour: number | null;
  analyticsOptOut: boolean;
};

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  reduceMotion: false,
  haptics: true,
  fontScale: 1,
  uiLocale: 'en',
  contentLanguage: null,
  ambience: 'none',
  sessionMinutes: 25,
  // Notifications are opt-in. Only the "your material is ready" one defaults on,
  // because the user explicitly started that job and is waiting for it.
  notifyReviewDue: false,
  notifyExamCountdown: false,
  notifyProcessingDone: true,
  dailyReviewHour: null,
  analyticsOptOut: false,
};

type PreferencesState = Preferences & {
  hydrated: boolean;
  set: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  replaceAll: (next: Partial<Preferences>) => void;
};

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,
      uiLocale: resolveDeviceLocale(),
      hydrated: false,

      set: (key, value) => {
        set({ [key]: value } as Pick<Preferences, typeof key>);
        if (key === 'uiLocale') setLocale(value as LocaleCode);
        void pushToServer({ [key]: value } as Partial<Preferences>);
      },

      replaceAll: (next) => {
        set(next as Partial<PreferencesState>);
        if (next.uiLocale) setLocale(next.uiLocale);
      },
    }),
    {
      name: 'vela.preferences',
      storage: createJSONStorage(() => AsyncStorage),
      // `hydrated` is runtime-only; persisting it would defeat its purpose.
      partialize: ({ hydrated: _hydrated, set: _set, replaceAll: _replaceAll, ...rest }) => rest,
      onRehydrateStorage: () => (state) => {
        if (state) {
          setLocale(state.uiLocale);
          usePreferences.setState({ hydrated: true });
        } else {
          usePreferences.setState({ hydrated: true });
        }
      },
    },
  ),
);

/* -------------------------------------------------------------------------- */
/* Server sync                                                                */
/* -------------------------------------------------------------------------- */

type PreferencesUpdate = Database['public']['Tables']['user_preferences']['Update'];
type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

/** Maps a camelCase preference patch onto its database columns. */
function toPreferencesRow(patch: Partial<Preferences>): PreferencesUpdate {
  const row: PreferencesUpdate = {};
  if (patch.theme !== undefined) row.theme = patch.theme;
  if (patch.reduceMotion !== undefined) row.reduce_motion = patch.reduceMotion;
  if (patch.haptics !== undefined) row.haptics_enabled = patch.haptics;
  if (patch.fontScale !== undefined) row.font_scale = patch.fontScale;
  if (patch.ambience !== undefined) row.default_ambience = patch.ambience;
  if (patch.sessionMinutes !== undefined) row.default_session_minutes = patch.sessionMinutes;
  if (patch.notifyReviewDue !== undefined) row.notify_review_due = patch.notifyReviewDue;
  if (patch.notifyExamCountdown !== undefined) row.notify_exam_countdown = patch.notifyExamCountdown;
  if (patch.notifyProcessingDone !== undefined) row.notify_processing_done = patch.notifyProcessingDone;
  if (patch.dailyReviewHour !== undefined) row.daily_review_hour = patch.dailyReviewHour;
  if (patch.analyticsOptOut !== undefined) row.analytics_opt_out = patch.analyticsOptOut;
  return row;
}

/**
 * Preferences are authoritative on-device and mirrored to the server so they
 * follow the student to a new phone. A failed sync is deliberately silent: the
 * local value already took effect and nothing is lost.
 */
async function pushToServer(patch: Partial<Preferences>) {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return;

  // ui_locale and content_language live on profiles, not user_preferences
  if (patch.uiLocale !== undefined || 'contentLanguage' in patch) {
    const profilePatch: ProfileUpdate = {};
    if (patch.uiLocale !== undefined) profilePatch.ui_locale = patch.uiLocale;
    if ('contentLanguage' in patch) profilePatch.content_language = patch.contentLanguage ?? null;
    await supabase.from('profiles').update(profilePatch).eq('id', userId);
  }

  const row = toPreferencesRow(patch);
  if (Object.keys(row).length === 0) return;

  await supabase.from('user_preferences').update(row).eq('user_id', userId);
}

/** Pulls server preferences after sign-in so a new device matches the account. */
export async function hydrateFromServer(userId: string) {
  const [{ data: prefs }, { data: profile }] = await Promise.all([
    supabase.from('user_preferences').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('profiles').select('ui_locale, content_language').eq('id', userId).maybeSingle(),
  ]);

  const next: Partial<Preferences> = {};
  if (prefs) {
    next.theme = prefs.theme as ThemePreference;
    next.reduceMotion = prefs.reduce_motion;
    next.haptics = prefs.haptics_enabled;
    next.fontScale = Number(prefs.font_scale);
    next.ambience = prefs.default_ambience as AmbienceKey;
    next.sessionMinutes = prefs.default_session_minutes;
    next.notifyReviewDue = prefs.notify_review_due;
    next.notifyExamCountdown = prefs.notify_exam_countdown;
    next.notifyProcessingDone = prefs.notify_processing_done;
    next.dailyReviewHour = prefs.daily_review_hour;
    next.analyticsOptOut = prefs.analytics_opt_out;
  }
  if (profile) {
    if (profile.ui_locale) next.uiLocale = profile.ui_locale as LocaleCode;
    next.contentLanguage = profile.content_language;
  }
  if (Object.keys(next).length > 0) {
    usePreferences.getState().replaceAll(next);
  }
}
