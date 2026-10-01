import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '../lib/supabase';
import { usePreferences } from '../stores/preferences';

/**
 * Product analytics.
 *
 * Two hard rules, enforced here rather than by convention:
 *
 *  1. Never record content. No note text, no transcript, no question the
 *     student asked the tutor, no space name. Only ids, counts, and enums.
 *  2. Honour the opt-out immediately and locally — nothing is queued or sent
 *     while it is on.
 *
 * Events are fire-and-forget: analytics must never slow down or break a study
 * session.
 */

export type AnalyticsEvent =
  | 'app_opened'
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'space_created'
  | 'first_capture'
  | 'capture_started'
  | 'recording_started'
  | 'recording_completed'
  | 'recording_discarded'
  | 'upload_completed'
  | 'processing_completed'
  | 'processing_failed'
  | 'note_opened'
  | 'note_edited'
  | 'stale_refresh_accepted'
  | 'transcript_opened'
  | 'review_session_started'
  | 'review_session_completed'
  | 'card_graded'
  | 'quiz_generated'
  | 'quiz_started'
  | 'quiz_completed'
  | 'tutor_message_sent'
  | 'exam_created'
  | 'exam_plan_generated'
  | 'focus_session_started'
  | 'focus_session_completed'
  | 'search_performed'
  | 'note_shared'
  | 'paywall_viewed'
  | 'checkout_started'
  | 'subscription_restored'
  | 'feedback_sent'
  | 'account_deleted';

/** Only primitives, and only values that cannot identify content. */
export type AnalyticsProps = Record<string, string | number | boolean | null>;

export function track(name: AnalyticsEvent, props: AnalyticsProps = {}): void {
  if (usePreferences.getState().analyticsOptOut) return;

  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) return;

      await supabase.from('analytics_events').insert({
        user_id: userId,
        name,
        props,
        platform: Platform.OS,
        app_version: Constants.expoConfig?.version ?? null,
      });
    } catch {
      // Analytics failing is never worth surfacing to a student.
    }
  })();
}

/**
 * Support reports.
 *
 * Carries enough context to reproduce a problem — ids, the failing stage, app
 * version — and none of the student's material.
 */
export async function sendFeedback(input: {
  kind: 'ai_quality' | 'transcription' | 'billing' | 'bug' | 'other';
  message: string;
  context?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Not signed in');

  const { error } = await supabase.from('feedback_reports').insert({
    user_id: data.user.id,
    kind: input.kind,
    message: input.message.trim(),
    context: {
      ...(input.context ?? {}),
      platform: Platform.OS,
      platform_version: String(Platform.Version),
      app_version: Constants.expoConfig?.version ?? 'unknown',
    },
  });

  if (error) throw error;
  track('feedback_sent', { kind: input.kind });
}
