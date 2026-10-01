import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type QuizMode } from '../lib/api';
import { qk } from '../lib/queryClient';
import { supabase, unwrap } from '../lib/supabase';

/**
 * Quizzes.
 *
 * Grading happens on the device for every question type the device can grade
 * correctly — multiple choice, true/false, matching. Only free-text answers go
 * to the server, because only they need judgement. That keeps a 30-question
 * quiz to one network round trip per written answer instead of thirty.
 */

export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'matching';

export type QuizQuestion = {
  id: string;
  quiz_set_id: string;
  concept_id: string | null;
  idx: number;
  type: QuestionType;
  prompt: string;
  options: string[] | { left: string[]; right: string[] };
  answer: number | boolean | string[] | number[][];
  explanation: string | null;
  tier: 'intro' | 'core' | 'advanced';
};

export type QuizSet = {
  id: string;
  space_id: string;
  source_id: string | null;
  title: string;
  mode: QuizMode;
  question_count: number;
  created_at: string;
};

export type AnswerValue = number | boolean | string | number[][];

/* -------------------------------------------------------------------------- */
/* Queries                                                                    */
/* -------------------------------------------------------------------------- */

export function useQuizSets(spaceId: string | undefined) {
  return useQuery({
    queryKey: qk.quizSets(spaceId ?? ''),
    enabled: Boolean(spaceId),
    queryFn: async (): Promise<QuizSet[]> =>
      unwrap(
        await supabase
          .from('quiz_sets')
          .select('*')
          .eq('space_id', spaceId!)
          .order('created_at', { ascending: false })
          .limit(50),
      ) as QuizSet[],
  });
}

export function useQuiz(quizSetId: string | undefined) {
  return useQuery({
    queryKey: qk.quiz(quizSetId ?? ''),
    enabled: Boolean(quizSetId),
    queryFn: async (): Promise<{ set: QuizSet; questions: QuizQuestion[] }> => {
      const set = unwrap(
        await supabase.from('quiz_sets').select('*').eq('id', quizSetId!).single(),
      ) as QuizSet;

      const questions = unwrap(
        await supabase
          .from('quiz_questions')
          .select('*')
          .eq('quiz_set_id', quizSetId!)
          .order('idx', { ascending: true }),
      ) as QuizQuestion[];

      return { set, questions };
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Generation                                                                 */
/* -------------------------------------------------------------------------- */

export function useGenerateQuiz() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      spaceId: string;
      sourceId?: string | null;
      examId?: string | null;
      mode?: QuizMode;
      count?: number;
      conceptIds?: string[];
    }) => api.generateQuiz(input),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: qk.quizSets(input.spaceId) });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Attempts                                                                   */
/* -------------------------------------------------------------------------- */

export async function startAttempt(quizSetId: string, total: number, sessionId?: string) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in');

  return unwrap(
    await supabase
      .from('quiz_attempts')
      .insert({
        user_id: userData.user.id,
        quiz_set_id: quizSetId,
        session_id: sessionId ?? null,
        total,
      })
      .select('id')
      .single(),
  ) as { id: string };
}

export type GradedAnswer = {
  correct: boolean;
  note: string | null;
  explanation: string | null;
};

/**
 * Grades one answer.
 *
 * Everything except free text is decided here, from the stored answer key, so
 * feedback is immediate and works offline for the rest of the quiz.
 */
export async function submitAnswer(input: {
  question: QuizQuestion;
  attemptId: string;
  answer: AnswerValue;
  durationMs: number;
}): Promise<GradedAnswer> {
  const { question, attemptId, answer, durationMs } = input;

  if (question.type === 'short_answer') {
    const result = await api.gradeAnswer({
      questionId: question.id,
      attemptId,
      response: String(answer ?? ''),
      durationMs,
    });
    return { correct: result.correct, note: result.note, explanation: result.explanation };
  }

  const correct = gradeLocally(question, answer);

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Not signed in');

  await supabase.from('quiz_responses').upsert(
    {
      user_id: userData.user.id,
      attempt_id: attemptId,
      question_id: question.id,
      concept_id: question.concept_id,
      response: answer as never,
      is_correct: correct,
      duration_ms: Math.min(durationMs, 600_000),
    },
    { onConflict: 'attempt_id,question_id' },
  );

  if (question.concept_id) {
    await supabase.rpc('recompute_concept_mastery', { p_concept_id: question.concept_id });
  }

  return { correct, note: null, explanation: question.explanation };
}

export function gradeLocally(question: QuizQuestion, answer: AnswerValue): boolean {
  switch (question.type) {
    case 'multiple_choice':
      return typeof answer === 'number' && answer === question.answer;

    case 'true_false':
      return typeof answer === 'boolean' && answer === question.answer;

    case 'matching': {
      const key = question.answer as number[][];
      const given = answer as number[][];
      if (!Array.isArray(given) || given.length !== key.length) return false;
      // Order of the pairs does not matter, only the pairing itself.
      const keySet = new Set(key.map(([l, r]) => `${l}:${r}`));
      return given.every(([l, r]) => keySet.has(`${l}:${r}`));
    }

    case 'short_answer': {
      // Only reached when offline; the server does the real judgement.
      const accepted = (question.answer as string[]) ?? [];
      const given = String(answer ?? '').trim().toLowerCase();
      return accepted.some((a) => a.trim().toLowerCase() === given);
    }
  }
}

export async function finishAttempt(attemptId: string) {
  const responses = unwrap(
    await supabase.from('quiz_responses').select('is_correct').eq('attempt_id', attemptId),
  ) as { is_correct: boolean }[];

  const total = responses.length;
  const correct = responses.filter((r) => r.is_correct).length;
  const score = total > 0 ? correct / total : 0;

  await supabase
    .from('quiz_attempts')
    .update({
      completed_at: new Date().toISOString(),
      total,
      correct,
      score,
    })
    .eq('id', attemptId);

  return { total, correct, score };
}

/**
 * The post-quiz review: which concepts held up and which did not.
 * A score alone tells a student nothing about what to do next.
 */
export async function attemptBreakdown(attemptId: string) {
  const responses = unwrap(
    await supabase
      .from('quiz_responses')
      .select('question_id, concept_id, is_correct, response, grader_note')
      .eq('attempt_id', attemptId),
  ) as {
    question_id: string;
    concept_id: string | null;
    is_correct: boolean;
    response: unknown;
    grader_note: string | null;
  }[];

  const conceptIds = [...new Set(responses.map((r) => r.concept_id).filter((id): id is string => !!id))];

  const concepts = conceptIds.length
    ? ((unwrap(
        await supabase.from('concepts').select('id, name, mastery').in('id', conceptIds),
      ) as { id: string; name: string; mastery: number }[]) ?? [])
    : [];

  const byConcept = new Map<string, { name: string; correct: number; total: number }>();
  for (const response of responses) {
    if (!response.concept_id) continue;
    const concept = concepts.find((c) => c.id === response.concept_id);
    if (!concept) continue;
    const entry = byConcept.get(response.concept_id) ?? { name: concept.name, correct: 0, total: 0 };
    entry.total += 1;
    if (response.is_correct) entry.correct += 1;
    byConcept.set(response.concept_id, entry);
  }

  const entries = [...byConcept.entries()].map(([id, value]) => ({ id, ...value }));

  return {
    responses,
    mastered: entries.filter((e) => e.correct === e.total),
    missed: entries.filter((e) => e.correct < e.total),
  };
}
