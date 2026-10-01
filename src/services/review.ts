import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from '../lib/queryClient';
import { supabase, unwrap } from '../lib/supabase';
import { grade, GRADE_VALUE, type CardState, type ReviewGrade } from './scheduler';
import { useUserId } from '../stores/auth';

/**
 * Flashcard review.
 *
 * Grading is applied locally and written back optimistically: pressing "Good"
 * must advance instantly, because a review session is thirty of these in a row
 * and a spinner between each one destroys the rhythm. The write is small and
 * idempotent, so a failure mid-session costs at most one card's scheduling.
 */

export type DueCard = {
  card_id: string;
  deck_id: string;
  space_id: string;
  concept_id: string | null;
  front: string;
  back: string;
  explanation: string | null;
  tier: 'intro' | 'core' | 'advanced';
  source_ref: { segment_ids?: string[]; page?: number | null; source_id?: string };
  due: string;
  state: CardState['state'];
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  last_review: string | null;
};

export function toCardState(card: DueCard): CardState {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    // elapsed_days is recomputed by the scheduler from last_review
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review,
  };
}

/* -------------------------------------------------------------------------- */
/* Queue                                                                      */
/* -------------------------------------------------------------------------- */

export function useDueCards(spaceId?: string, limit = 40) {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.dueCards(spaceId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<DueCard[]> => {
      const { data, error } = await supabase.rpc('due_cards', {
        p_space_id: spaceId,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as DueCard[];
    },
  });
}

export function useDueCounts() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.dueCounts(),
    enabled: Boolean(userId),
    queryFn: async (): Promise<{ space_id: string; space_name: string; due_count: number }[]> => {
      const { data, error } = await supabase.rpc('due_counts');
      if (error) throw error;
      return (data ?? []) as { space_id: string; space_name: string; due_count: number }[];
    },
  });
}

/**
 * Cards the student can study before they are due.
 *
 * "Nothing is due" is a dead end the evening before an exam, so studying ahead
 * is always offered — it just does not pretend to be a scheduled review.
 */
export function useAheadCards(spaceId?: string, limit = 30) {
  return useQuery({
    queryKey: ['aheadCards', spaceId ?? 'all'],
    enabled: false,
    queryFn: async (): Promise<DueCard[]> => {
      let query = supabase
        .from('flashcards')
        .select(
          'id, deck_id, space_id, concept_id, front, back, explanation, tier, source_ref, card_states(due, state, stability, difficulty, reps, lapses, last_review)',
        )
        .eq('suspended', false)
        .limit(limit);

      if (spaceId) query = query.eq('space_id', spaceId);

      const rows = unwrap(await query) as unknown as (Omit<DueCard, 'card_id' | 'due' | 'state' | 'stability' | 'difficulty' | 'reps' | 'lapses' | 'last_review'> & {
        id: string;
        card_states: {
          due: string; state: CardState['state']; stability: number;
          difficulty: number; reps: number; lapses: number; last_review: string | null;
        } | null;
      })[];

      return rows
        .filter((row) => row.card_states)
        .map((row) => ({
          card_id: row.id,
          deck_id: row.deck_id,
          space_id: row.space_id,
          concept_id: row.concept_id,
          front: row.front,
          back: row.back,
          explanation: row.explanation,
          tier: row.tier,
          source_ref: row.source_ref,
          due: row.card_states!.due,
          state: row.card_states!.state,
          stability: row.card_states!.stability,
          difficulty: row.card_states!.difficulty,
          reps: row.card_states!.reps,
          lapses: row.card_states!.lapses,
          last_review: row.card_states!.last_review,
        }));
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Grading                                                                    */
/* -------------------------------------------------------------------------- */

export type GradeInput = {
  card: DueCard;
  reviewGrade: ReviewGrade;
  durationMs: number;
  sessionId?: string | null;
};

export function useGradeCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ card, reviewGrade, durationMs, sessionId }: GradeInput) => {
      const before = toCardState(card);
      const result = grade(before, reviewGrade);

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error('Not signed in');

      // The scheduling write and the event log are independent on purpose: if
      // the log write fails we still keep the schedule correct, and vice versa.
      const [stateResult, eventResult] = await Promise.all([
        supabase
          .from('card_states')
          .update({
            due: result.next.due,
            stability: result.next.stability,
            difficulty: result.next.difficulty,
            elapsed_days: result.next.elapsed_days,
            scheduled_days: result.next.scheduled_days,
            learning_steps: result.next.learning_steps,
            reps: result.next.reps,
            lapses: result.next.lapses,
            state: result.next.state,
            last_review: result.next.last_review,
            updated_at: new Date().toISOString(),
          })
          .eq('card_id', card.card_id),

        supabase.from('review_events').insert({
          user_id: userId,
          card_id: card.card_id,
          concept_id: card.concept_id,
          session_id: sessionId ?? null,
          rating: GRADE_VALUE[reviewGrade],
          state_before: before.state,
          stability_before: before.stability,
          difficulty_before: before.difficulty,
          duration_ms: Math.min(durationMs, 600_000),
        }),
      ]);

      if (stateResult.error) throw stateResult.error;
      if (eventResult.error) console.warn('review event not recorded', eventResult.error.message);

      // Mastery drives weak-area review and exam readiness, so it is refreshed
      // as soon as there is new evidence.
      if (card.concept_id) {
        await supabase.rpc('recompute_concept_mastery', { p_concept_id: card.concept_id });
      }

      return result;
    },

    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.dueCounts() });
    },
  });
}

export function useSuspendCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { cardId: string; suspended: boolean }) => {
      unwrap(
        await supabase
          .from('flashcards')
          .update({ suspended: input.suspended })
          .eq('id', input.cardId)
          .select('id')
          .single(),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dueCards'] });
      void queryClient.invalidateQueries({ queryKey: qk.dueCounts() });
    },
  });
}

export function useEditCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      cardId: string;
      front: string;
      back: string;
      explanation?: string | null;
    }) => {
      // Marking the card as user-edited protects it from being replaced when
      // stale material is regenerated.
      unwrap(
        await supabase
          .from('flashcards')
          .update({
            front: input.front,
            back: input.back,
            explanation: input.explanation ?? null,
            is_user_edited: true,
          })
          .eq('id', input.cardId)
          .select('id')
          .single(),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dueCards'] });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Decks                                                                      */
/* -------------------------------------------------------------------------- */

export type Deck = {
  id: string;
  space_id: string;
  source_id: string | null;
  title: string;
  cardCount: number;
  dueCount: number;
};

export function useDecks(spaceId: string | undefined) {
  return useQuery({
    queryKey: qk.decks(spaceId ?? ''),
    enabled: Boolean(spaceId),
    queryFn: async (): Promise<Deck[]> => {
      const decks = unwrap(
        await supabase
          .from('decks')
          .select('id, space_id, source_id, title')
          .eq('space_id', spaceId!)
          .order('updated_at', { ascending: false }),
      ) as Omit<Deck, 'cardCount' | 'dueCount'>[];

      if (decks.length === 0) return [];

      const cards = unwrap(
        await supabase
          .from('flashcards')
          .select('id, deck_id, card_states(due)')
          .in('deck_id', decks.map((d) => d.id))
          .eq('suspended', false),
      ) as unknown as { id: string; deck_id: string; card_states: { due: string } | null }[];

      const now = Date.now();
      const totals = new Map<string, { total: number; due: number }>();
      for (const card of cards) {
        const entry = totals.get(card.deck_id) ?? { total: 0, due: 0 };
        entry.total += 1;
        if (card.card_states && new Date(card.card_states.due).getTime() <= now) entry.due += 1;
        totals.set(card.deck_id, entry);
      }

      return decks.map((deck) => ({
        ...deck,
        cardCount: totals.get(deck.id)?.total ?? 0,
        dueCount: totals.get(deck.id)?.due ?? 0,
      }));
    },
  });
}
