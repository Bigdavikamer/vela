import { generateJson } from '../_shared/ai.ts';
import { FunctionError, json } from '../_shared/http.ts';
import { examPlanSystem } from '../_shared/prompts.ts';
import { examPlanSchema, type GeneratedPlan } from '../_shared/schemas.ts';
import type { AuthedContext } from '../_shared/supabase.ts';

/**
 * Exam preparation.
 *
 * The plan is built from real signal — concept importance from the material,
 * mastery from the student's own reviews and quizzes — and it is labelled as
 * study guidance. Vela does not predict grades, and says so in the UI.
 */

export type ExamPlanBody = { examId: string };

export async function buildExamPlan(ctx: AuthedContext, body: ExamPlanBody): Promise<Response> {
  const { examId } = body;
  if (!examId) throw new FunctionError('bad_request', 'examId is required.');

  const { data: exam } = await ctx.db
    .from('exams')
    .select('id, space_id, title, exam_date, notes')
    .eq('id', examId)
    .maybeSingle();
  if (!exam) throw new FunctionError('not_found', 'That exam no longer exists.');

  const daysUntil = daysBetween(new Date(), new Date(`${exam.exam_date}T00:00:00Z`));
  if (daysUntil < 0) {
    throw new FunctionError('bad_request', 'That exam date has already passed.');
  }

  const { data: conceptRows } = await ctx.db
    .from('concepts')
    .select('id, name, importance, mastery, definition')
    .eq('space_id', exam.space_id)
    .order('importance', { ascending: false })
    .limit(80);

  const concepts = ((conceptRows ?? []) as {
    id: string; name: string; importance: number; mastery: number; definition: string | null;
  }[]).map((c) => ({ ...c, mastery: Number(c.mastery) }));

  if (concepts.length === 0) {
    throw new FunctionError(
      'bad_request',
      'Add material to this space first — Vela plans from the concepts in your own material.',
    );
  }

  const { data: profile } = await ctx.db
    .from('profiles')
    .select('content_language')
    .eq('id', ctx.userId)
    .maybeSingle();

  const plan = await generateJson<GeneratedPlan>({
    system: examPlanSystem(daysUntil, profile?.content_language ?? null),
    messages: [
      {
        role: 'user',
        content: `Exam: ${exam.title}
Days until the exam: ${daysUntil}
${exam.notes ? `The student notes: ${exam.notes}` : ''}

Concepts in scope (name | importance 1-5 | mastery 0-1, where 0 means no evidence yet):
${concepts.map((c) => `${c.name} | ${c.importance} | ${c.mastery.toFixed(2)}`).join('\n')}

Build the plan. day_offset 0 is today; the exam is on day ${daysUntil}.`,
      },
    ],
    schema: examPlanSchema as unknown as Record<string, unknown>,
    maxTokens: 12000,
    effort: 'high',
  });

  // Scope every topic in the exam from the concepts we actually have.
  await ctx.db.from('exam_topics').delete().eq('exam_id', examId);
  await ctx.db.from('exam_topics').insert(
    concepts.map((c) => ({
      user_id: ctx.userId,
      exam_id: examId,
      concept_id: c.id,
      title: c.name,
      priority: c.importance,
    })),
  );

  // Replace only items the student has not already worked through.
  await ctx.db
    .from('study_plan_items')
    .delete()
    .eq('exam_id', examId)
    .is('completed_at', null);

  const conceptIdByName = new Map(concepts.map((c) => [c.name, c.id]));
  const today = startOfDay(new Date());

  const items = plan.items
    .filter((item) => item.day_offset >= 0 && item.day_offset <= daysUntil)
    .map((item) => ({
      user_id: ctx.userId,
      exam_id: examId,
      scheduled_for: addDays(today, item.day_offset).toISOString().slice(0, 10),
      kind: item.kind,
      title: item.title,
      target: {
        concept_ids: item.concept_names
          .map((n) => conceptIdByName.get(n))
          .filter((id): id is string => Boolean(id)),
      },
      estimated_minutes: Math.min(240, Math.max(1, item.estimated_minutes)),
      priority: item.priority,
    }));

  if (items.length > 0) await ctx.db.from('study_plan_items').insert(items);

  const readiness = computeReadiness(concepts);

  await ctx.db
    .from('exams')
    .update({
      plan_generated_at: new Date().toISOString(),
      readiness,
      readiness_updated_at: new Date().toISOString(),
    })
    .eq('id', examId);

  return json({ items: items.length, readiness, note: plan.note, daysUntil });
}

/**
 * Readiness is an importance-weighted mean of mastery across the exam scope.
 *
 * It is deliberately conservative: a concept with no evidence counts as zero
 * rather than being skipped, so "80% ready" cannot mean "80% of the 5 concepts
 * I happened to review".
 */
function computeReadiness(
  concepts: { importance: number; mastery: number }[],
): number {
  if (concepts.length === 0) return 0;
  const totalWeight = concepts.reduce((sum, c) => sum + c.importance, 0);
  if (totalWeight === 0) return 0;
  const weighted = concepts.reduce((sum, c) => sum + c.importance * c.mastery, 0);
  return Math.round((weighted / totalWeight) * 1000) / 1000;
}

export type ExamReadinessBody = { examId: string };

/** Recomputes readiness without rebuilding the plan. Cheap; no model call. */
export async function refreshReadiness(
  ctx: AuthedContext,
  body: ExamReadinessBody,
): Promise<Response> {
  const { data: exam } = await ctx.db
    .from('exams')
    .select('id, space_id')
    .eq('id', body.examId)
    .maybeSingle();
  if (!exam) throw new FunctionError('not_found', 'That exam no longer exists.');

  const { data } = await ctx.db
    .from('concepts')
    .select('importance, mastery')
    .eq('space_id', exam.space_id);

  const concepts = ((data ?? []) as { importance: number; mastery: number }[]).map((c) => ({
    importance: c.importance,
    mastery: Number(c.mastery),
  }));

  const readiness = computeReadiness(concepts);

  await ctx.db
    .from('exams')
    .update({ readiness, readiness_updated_at: new Date().toISOString() })
    .eq('id', body.examId);

  return json({ readiness });
}

/* -------------------------------------------------------------------------- */

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function daysBetween(from: Date, to: Date): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.round(ms / 86400000);
}
