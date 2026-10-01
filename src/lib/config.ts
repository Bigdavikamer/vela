import Constants from 'expo-constants';

/**
 * Typed, fail-fast access to app configuration.
 *
 * A missing Supabase URL is not something to discover three screens into
 * onboarding, so we validate once at module load and throw with a message that
 * says exactly what to do.
 */

type Extra = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  webBaseUrl?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

function required(value: string | undefined, name: string): string {
  if (!value || value.startsWith('your-') || value === 'sb_publishable_xxx') {
    throw new Error(
      `Missing configuration: ${name}.\n` +
        `Copy .env.example to .env and fill in your Supabase project values, ` +
        `then restart the dev server (env vars are read at bundle time).`,
    );
  }
  return value;
}

export const config = {
  supabaseUrl: required(extra.supabaseUrl, 'EXPO_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: required(extra.supabaseAnonKey, 'EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  webBaseUrl: extra.webBaseUrl ?? 'https://vela.app',
  appVersion: Constants.expoConfig?.version ?? '0.0.0',
} as const;

/** Free-tier limits. The server enforces these; the client only explains them. */
export const FREE_LIMITS = {
  sourcesPerMonth: 5,
  captureMinutesPerMonth: 90,
  tutorMessagesPerMonth: 40,
  /** quizzes are uncapped on both tiers -- length limits are a competitor
   *  frustration we deliberately do not reproduce */
  maxQuizQuestions: 100,
} as const;
