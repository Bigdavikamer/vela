import { QueryClient } from '@tanstack/react-query';

import { VelaError } from './supabase';

/**
 * Query defaults tuned for a mobile study app on a flaky campus network.
 *
 * The important choice is the retry predicate: retrying a 403 or a "not found"
 * just delays the error the student needs to see, while retrying a dropped
 * connection usually succeeds.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: (failureCount, error) => {
        if (error instanceof VelaError && !error.retryable) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: (failureCount, error) => {
        if (error instanceof VelaError && !error.retryable) return false;
        return failureCount < 1;
      },
    },
  },
});

/** Query keys in one place, so invalidation is never a guessing game. */
export const qk = {
  profile: (userId: string) => ['profile', userId] as const,
  /** drives the route guard; primed by completeOnboarding() */
  onboarding: (userId: string) => ['onboarding', userId] as const,
  subscription: (userId: string) => ['subscription', userId] as const,
  usage: (userId: string) => ['usage', userId] as const,

  spaces: () => ['spaces'] as const,
  space: (id: string) => ['space', id] as const,

  sources: (spaceId: string) => ['sources', spaceId] as const,
  source: (id: string) => ['source', id] as const,

  note: (sourceId: string) => ['note', 'source', sourceId] as const,
  noteById: (noteId: string) => ['note', noteId] as const,
  noteStale: (noteId: string) => ['note', noteId, 'stale'] as const,
  transcript: (sourceId: string) => ['transcript', sourceId] as const,

  concepts: (spaceId: string) => ['concepts', spaceId] as const,
  conceptMap: (spaceId: string) => ['conceptMap', spaceId] as const,

  decks: (spaceId: string) => ['decks', spaceId] as const,
  dueCards: (spaceId?: string) => ['dueCards', spaceId ?? 'all'] as const,
  dueCounts: () => ['dueCounts'] as const,

  quizSets: (spaceId: string) => ['quizSets', spaceId] as const,
  quiz: (id: string) => ['quiz', id] as const,

  exams: () => ['exams'] as const,
  exam: (id: string) => ['exam', id] as const,
  examPlan: (examId: string) => ['examPlan', examId] as const,

  threads: (spaceId: string) => ['threads', spaceId] as const,
  thread: (id: string) => ['thread', id] as const,

  search: (query: string, spaceId?: string) => ['search', query, spaceId ?? 'all'] as const,
  insights: () => ['insights'] as const,
} as const;
