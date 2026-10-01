import { generateJson } from '../_shared/ai.ts';
import { recordUsage } from '../_shared/entitlements.ts';
import { FunctionError, json } from '../_shared/http.ts';
import { GRADING_SYSTEM, quizSystem } from '../_shared/prompts.ts';
import {
  gradingSchema,
  quizSchema,
  validateQuiz,
  type GeneratedQuiz,
  type GradingResult,
} from '../_shared/schemas.ts';
import type { AuthedContext } from '../_shared/supabase.ts';

/**
 * Quiz generation.
 *
 * Deliberately uncapped: length is the student's choice, up to 100 questions.
 * Arbitrary quiz limits are one of the loudest complaints about this category
 * and there is no good reason to reproduce them.
 */

export type QuizBody = {
  spaceId: string;
  sourceId?: string | null;
  examId?: string | null;
  mode?: 'quick' | 'standard' | 'long' | 'weak_areas' | 'exam_sim' | 'custom';
  count?: number;
  /** restrict to specific concepts, e.g. from an exam plan item */
  conceptIds?: string[];
};

const MODE_COUNTS: Record<string, number> = {
  quick: 5,
  standard: 10,
  long: 20,
  weak_areas: 10,
  exam_sim: 25,
  custom: 10,
};

export async function generateQuiz(ctx: AuthedContext, body: QuizBody): Promise<Response> {
  const { spaceId, sourceId, examId, conceptIds } = body;
  const mode = body.mode ?? 'standard';

  if (!spaceId) throw new FunctionError('bad_request', 'spaceId is required.');

  const count = Math.min(100, Math.max(1, body.count ?? MODE_COUNTS[mode] ?? 10));

  const { data: space } = await ctx.db
    .from('study_spaces')
    .select('id, name')
    .eq('id', spaceId)
    .maybeSingle();
  if (!space) throw new FunctionError('not_found', 'That study space no longer exists.');

  const concepts = await loadConcepts(ctx, spaceId, mode, conceptIds);
  if (concepts.length === 0) {
    throw new FunctionError(
      'bad_request',
      mode === 'weak_areas'
        ? 'Nothing is marked as weak yet. Review some cards or take a quiz first.'
        : 'Add material to this space first — Vela writes questions from your own material.',
    );
  }

  const material = await loadMaterial(ctx, spaceId, sourceId ?? null);
  if (!material.trim()) {
    throw new FunctionError(
      'bad_request',
      'There is no processed material in this space yet.',
    );
  }

  const { data: profile } = await ctx.db
    .from('profiles')
    .select('content_language')
    .eq('id', ctx.userId)
    .maybeSingle();

  const generated = await generateJson<GeneratedQuiz>({
    system: quizSystem(profile?.content_language ?? null, null, mode),
    messages: [
      {
        role: 'user',
        content: `Write exactly ${count} questions.

Concepts to draw on (use these exact names for concept_name):
${concepts.map((c) => `- ${c.name} (importance ${c.importance}, mastery ${c.mastery.toFixed(2)})`).join('\n')}

<material>
${material.slice(0, 300000)}
</material>`,
      },
    ],
    schema: quizSchema as unknown as Record<string, unknown>,
    // questions are verbose; give the model room for the requested count
    maxTokens: Math.min(32000, 2000 + count * 700),
    effort: mode === 'exam_sim' ? 'high' : 'medium',
  });

  const conceptIdByName = new Map(concepts.map((c) => [c.name, c.id]));
  const { questions, dropped } = validateQuiz(generated, new Set(conceptIdByName.keys()));

  if (questions.length === 0) {
    throw new FunctionError(
      'provider_failed',
      'Vela could not write usable questions from this material. Try again, or add more material.',
    );
  }
  if (dropped > 0) console.warn(`dropped ${dropped} malformed questions`, { spaceId });

  const { data: quizSet, error } = await ctx.db
    .from('quiz_sets')
    .insert({
      user_id: ctx.userId,
      space_id: spaceId,
      source_id: sourceId ?? null,
      exam_id: examId ?? null,
      title: titleFor(mode, space.name),
      mode,
      question_count: questions.length,
      config: { requested: count, dropped },
    })
    .select('id')
    .single();

  if (error || !quizSet) {
    throw new FunctionError('internal', 'Could not save the quiz.', error?.message);
  }

  const rows = questions.map((q, i) => ({
    user_id: ctx.userId,
    quiz_set_id: quizSet.id,
    space_id: spaceId,
    concept_id: q.concept_name ? (conceptIdByName.get(q.concept_name) ?? null) : null,
    idx: i,
    type: q.type,
    prompt: q.prompt,
    options:
      q.type === 'matching'
        ? { left: q.options, right: q.options_right }
        : q.options,
    answer: answerFor(q),
    explanation: q.explanation,
    tier: q.tier,
  }));

  const { error: insertError } = await ctx.db.from('quiz_questions').insert(rows);
  if (insertError) {
    throw new FunctionError('internal', 'Could not save the questions.', insertError.message);
  }

  await recordUsage(ctx.admin, ctx.userId, 'quizzes_generated');

  return json({ quizSetId: quizSet.id, questionCount: questions.length, dropped });
}

function answerFor(q: GeneratedQuiz['questions'][number]): unknown {
  switch (q.type) {
    case 'multiple_choice': return q.answer_index;
    case 'true_false': return q.answer_boolean;
    case 'short_answer': return q.answer_text;
    case 'matching': return q.answer_pairs;
  }
}

function titleFor(mode: string, spaceName: string): string {
  switch (mode) {
    case 'weak_areas': return 'Weak areas';
    case 'exam_sim': return 'Exam simulation';
    case 'quick': return 'Quick quiz';
    case 'long': return 'Thorough quiz';
    default: return spaceName;
  }
}

/* -------------------------------------------------------------------------- */

type ConceptRow = { id: string; name: string; importance: number; mastery: number };

async function loadConcepts(
  ctx: AuthedContext,
  spaceId: string,
  mode: string,
  conceptIds?: string[],
): Promise<ConceptRow[]> {
  let query = ctx.db
    .from('concepts')
    .select('id, name, importance, mastery')
    .eq('space_id', spaceId);

  if (conceptIds && conceptIds.length > 0) {
    query = query.in('id', conceptIds);
  } else if (mode === 'weak_areas') {
    query = query.lt('mastery', 0.6).not('mastery_updated_at', 'is', null);
  }

  const { data } = await query
    .order('importance', { ascending: false })
    .limit(60);

  return ((data ?? []) as ConceptRow[]).map((c) => ({ ...c, mastery: Number(c.mastery) }));
}

/** Note text is the best material for question writing: it is already the
 *  distilled version, so more of the space fits in one prompt. */
async function loadMaterial(
  ctx: AuthedContext,
  spaceId: string,
  sourceId: string | null,
): Promise<string> {
  let notesQuery = ctx.db
    .from('notes')
    .select('id, title, source_id')
    .eq('space_id', spaceId);
  if (sourceId) notesQuery = notesQuery.eq('source_id', sourceId);

  const { data: notes } = await notesQuery.limit(25);
  const noteRows = (notes ?? []) as { id: string; title: string }[];
  if (noteRows.length === 0) return '';

  const { data: blocks } = await ctx.db
    .from('note_blocks')
    .select('note_id, type, term, content, position')
    .in('note_id', noteRows.map((n) => n.id))
    .order('position', { ascending: true })
    .limit(3000);

  const byNote = new Map<string, string[]>();
  for (const b of (blocks ?? []) as {
    note_id: string; type: string; term: string | null; content: string;
  }[]) {
    const line = b.term ? `${b.term}: ${b.content}` : b.content;
    const list = byNote.get(b.note_id) ?? [];
    list.push(b.type === 'heading' ? `\n## ${line}` : line);
    byNote.set(b.note_id, list);
  }

  return noteRows
    .map((n) => `# ${n.title}\n${(byNote.get(n.id) ?? []).join('\n')}`)
    .join('\n\n');
}

/* -------------------------------------------------------------------------- */
/* Grading                                                                    */
/* -------------------------------------------------------------------------- */

export type GradeBody = {
  questionId: string;
  attemptId: string;
  response: string;
  durationMs?: number;
};

/**
 * Grades one short answer. Everything else (multiple choice, true/false,
 * matching) is graded on-device with no round trip -- only free text needs a
 * model, and only free text pays for one.
 */
export async function gradeAnswer(ctx: AuthedContext, body: GradeBody): Promise<Response> {
  const { questionId, attemptId, response, durationMs } = body;

  if (!questionId || !attemptId) {
    throw new FunctionError('bad_request', 'questionId and attemptId are required.');
  }

  const { data: question } = await ctx.db
    .from('quiz_questions')
    .select('id, type, prompt, answer, explanation, concept_id')
    .eq('id', questionId)
    .maybeSingle();

  if (!question) throw new FunctionError('not_found', 'That question no longer exists.');
  if (question.type !== 'short_answer') {
    throw new FunctionError('bad_request', 'Only short answers are graded by the model.');
  }

  const accepted = (question.answer as string[]) ?? [];
  const given = (response ?? '').trim();

  let result: GradingResult;

  // An exact match needs no model call.
  if (accepted.some((a) => a.trim().toLowerCase() === given.toLowerCase())) {
    result = { correct: true, note: 'Exactly right.' };
  } else if (!given) {
    result = { correct: false, note: 'Nothing was answered.' };
  } else {
    result = await generateJson<GradingResult>({
      system: GRADING_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Question: ${question.prompt}

Accepted answers:
${accepted.map((a) => `- ${a}`).join('\n')}

The student answered: ${given}`,
        },
      ],
      schema: gradingSchema as unknown as Record<string, unknown>,
      maxTokens: 400,
      effort: 'low',
      think: false,
    });
  }

  await ctx.db.from('quiz_responses').upsert(
    {
      user_id: ctx.userId,
      attempt_id: attemptId,
      question_id: questionId,
      concept_id: question.concept_id,
      response: given,
      is_correct: result.correct,
      grader_note: result.note,
      duration_ms: durationMs ?? null,
    },
    { onConflict: 'attempt_id,question_id' },
  );

  if (question.concept_id) {
    await ctx.db.rpc('recompute_concept_mastery', { p_concept_id: question.concept_id });
  }

  return json({ correct: result.correct, note: result.note, explanation: question.explanation });
}
