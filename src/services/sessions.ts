import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from '../lib/queryClient';
import { supabase, unwrap } from '../lib/supabase';
import type { AmbienceKey } from '../stores/preferences';
import { useUserId } from '../stores/auth';

/**
 * Study sessions and progress.
 *
 * A session exists to give a stretch of studying a beginning, a goal, and an
 * end — not to gamify time. `focused_seconds` counts only time actually spent
 * working, so a student who walks away does not come back to a fake number.
 */

export type SessionMode = 'focus' | 'deep' | 'quick_review' | 'exam_prep';

export type StudySession = {
  id: string;
  space_id: string | null;
  exam_id: string | null;
  mode: SessionMode;
  goal: string | null;
  ambience: string;
  planned_minutes: number;
  focused_seconds: number;
  break_seconds: number;
  cards_reviewed: number;
  questions_answered: number;
  started_at: string;
  ended_at: string | null;
  completed: boolean;
};

export async function startSession(input: {
  spaceId?: string | null;
  examId?: string | null;
  mode: SessionMode;
  goal?: string;
  ambience: AmbienceKey;
  plannedMinutes: number;
}): Promise<StudySession> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in');

  return unwrap(
    await supabase
      .from('study_sessions')
      .insert({
        user_id: userData.user.id,
        space_id: input.spaceId ?? null,
        exam_id: input.examId ?? null,
        mode: input.mode,
        goal: input.goal?.trim() || null,
        ambience: input.ambience,
        planned_minutes: input.plannedMinutes,
      })
      .select('*')
      .single(),
  ) as StudySession;
}

export async function endSession(input: {
  sessionId: string;
  focusedSeconds: number;
  breakSeconds: number;
  cardsReviewed: number;
  questionsAnswered: number;
  completed: boolean;
}): Promise<void> {
  await supabase
    .from('study_sessions')
    .update({
      focused_seconds: Math.max(0, Math.round(input.focusedSeconds)),
      break_seconds: Math.max(0, Math.round(input.breakSeconds)),
      cards_reviewed: input.cardsReviewed,
      questions_answered: input.questionsAnswered,
      ended_at: new Date().toISOString(),
      completed: input.completed,
    })
    .eq('id', input.sessionId);
}

/* -------------------------------------------------------------------------- */
/* Insights                                                                   */
/* -------------------------------------------------------------------------- */

export type Insights = {
  minutesThisWeek: number;
  sessionsThisWeek: number;
  /** distinct days studied in the last 7 */
  activeDays: number;
  streak: number;
  reviewsThisWeek: number;
  quizAverage: number | null;
  conceptsSolid: number;
  conceptsShaky: number;
};

/**
 * Progress metrics.
 *
 * Deliberately excludes vanity numbers (total cards owned, lifetime minutes).
 * Everything here is meant to answer "am I keeping up, and where should I spend
 * my next hour".
 */
export function useInsights() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.insights(),
    enabled: Boolean(userId),
    queryFn: async (): Promise<Insights> => {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

      const [sessions, reviews, attempts, concepts] = await Promise.all([
        supabase
          .from('study_sessions')
          .select('focused_seconds, started_at')
          .gte('started_at', weekAgo),
        supabase.from('review_events').select('reviewed_at').gte('reviewed_at', weekAgo),
        supabase
          .from('quiz_attempts')
          .select('score')
          .not('completed_at', 'is', null)
          .gte('started_at', weekAgo),
        supabase.from('concepts').select('mastery, mastery_updated_at'),
      ]);

      const sessionRows = (sessions.data ?? []) as { focused_seconds: number; started_at: string }[];
      const reviewRows = (reviews.data ?? []) as { reviewed_at: string }[];
      const attemptRows = (attempts.data ?? []) as { score: number | null }[];
      const conceptRows = (concepts.data ?? []) as {
        mastery: number; mastery_updated_at: string | null;
      }[];

      const minutes = Math.round(
        sessionRows.reduce((sum, s) => sum + s.focused_seconds, 0) / 60,
      );

      const scored = attemptRows.map((a) => Number(a.score)).filter((n) => !Number.isNaN(n));
      const quizAverage = scored.length
        ? scored.reduce((sum, n) => sum + n, 0) / scored.length
        : null;

      // A day counts as active if anything happened on it, not only a formal
      // session — reviewing ten cards on the bus is studying.
      const activeDates = new Set<string>();
      for (const s of sessionRows) activeDates.add(s.started_at.slice(0, 10));
      for (const r of reviewRows) activeDates.add(r.reviewed_at.slice(0, 10));

      const withEvidence = conceptRows.filter((c) => c.mastery_updated_at !== null);

      return {
        minutesThisWeek: minutes,
        sessionsThisWeek: sessionRows.length,
        activeDays: activeDates.size,
        streak: computeStreak(activeDates),
        reviewsThisWeek: reviewRows.length,
        quizAverage,
        conceptsSolid: withEvidence.filter((c) => Number(c.mastery) >= 0.7).length,
        conceptsShaky: withEvidence.filter((c) => Number(c.mastery) < 0.45).length,
      };
    },
  });
}

/**
 * Consecutive days ending today or yesterday.
 *
 * Yesterday still counts so a streak is not destroyed by studying at 1am, and
 * so the number is not a source of anxiety before the day is over.
 */
export function computeStreak(activeDates: Set<string>, now = new Date()): number {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const cursor = new Date(today);
  if (!activeDates.has(iso(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!activeDates.has(iso(cursor))) return 0;
  }

  let streak = 0;
  while (activeDates.has(iso(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export function useRecentSessions(limit = 10) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['sessions', 'recent'],
    enabled: Boolean(userId),
    queryFn: async (): Promise<StudySession[]> =>
      unwrap(
        await supabase
          .from('study_sessions')
          .select('*')
          .not('ended_at', 'is', null)
          .order('started_at', { ascending: false })
          .limit(limit),
      ) as StudySession[],
  });
}

export function useEndSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: endSession,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.insights() });
      void queryClient.invalidateQueries({ queryKey: ['sessions', 'recent'] });
    },
  });
}
