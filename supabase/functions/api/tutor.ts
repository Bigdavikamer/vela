import { generateText, MODEL_FAST } from '../_shared/ai.ts';
import { embed } from '../_shared/embeddings.ts';
import { assertWithinQuota, recordUsage } from '../_shared/entitlements.ts';
import { FunctionError, json } from '../_shared/http.ts';
import { tutorSystem, type TutorMode } from '../_shared/prompts.ts';
import type { AuthedContext } from '../_shared/supabase.ts';

/**
 * The tutor.
 *
 * The defining choice: retrieval is scoped to the whole STUDY SPACE by default,
 * not to a single recording. A student asking "what do I need for the exam"
 * should get an answer drawn from every lecture and PDF in the subject, which
 * is exactly what one-note chat cannot do.
 *
 * Answers are grounded in retrieved excerpts and carry citations back to them,
 * so the student can check any claim against their own material.
 */

export type TutorBody = {
  threadId?: string;
  spaceId: string;
  sourceId?: string | null;
  mode?: TutorMode;
  message: string;
};

const MAX_EXCERPTS = 12;
const MAX_HISTORY = 16;

export async function tutor(ctx: AuthedContext, body: TutorBody): Promise<Response> {
  const { spaceId, sourceId, message } = body;
  const mode: TutorMode = body.mode ?? 'explain';

  if (!spaceId) throw new FunctionError('bad_request', 'spaceId is required.');
  if (!message?.trim()) throw new FunctionError('bad_request', 'Ask something first.');

  await assertWithinQuota(ctx.db, ctx.userId, 'tutor_messages');

  const { data: space } = await ctx.db
    .from('study_spaces')
    .select('id, name')
    .eq('id', spaceId)
    .maybeSingle();
  if (!space) throw new FunctionError('not_found', 'That study space no longer exists.');

  const threadId = await ensureThread(ctx, body, space.name);

  await ctx.db.from('chat_messages').insert({
    user_id: ctx.userId,
    thread_id: threadId,
    role: 'user',
    content: message.trim(),
  });

  const [excerpts, history, weakConcepts] = await Promise.all([
    retrieve(ctx, message, spaceId, sourceId ?? null),
    loadHistory(ctx, threadId),
    loadWeakConcepts(ctx, spaceId),
  ]);

  const { data: profile } = await ctx.db
    .from('profiles')
    .select('content_language')
    .eq('id', ctx.userId)
    .maybeSingle();

  const system = tutorSystem({
    mode,
    spaceName: space.name,
    contentLanguage: profile?.content_language ?? null,
    hasContext: excerpts.length > 0,
    weakConcepts,
  });

  const contextBlock =
    excerpts.length > 0
      ? `Excerpts from the student's material:\n\n${excerpts
          .map((e, i) => `[${i + 1}] (${e.kind}) ${e.snippet}`)
          .join('\n\n')}`
      : 'No excerpts from the student\'s material matched this question.';

  const result = await generateText({
    system,
    messages: [
      ...history,
      { role: 'user', content: `${contextBlock}\n\n---\n\nStudent's question: ${message.trim()}` },
    ],
    maxTokens: 4000,
    effort: mode === 'deep_dive' || mode === 'find_gaps' ? 'high' : 'medium',
  });

  // Only keep citations the model actually used, mapped back to real material.
  const used = new Set(
    [...result.text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])).filter((n) => n >= 1),
  );
  const citations = [...used]
    .map((n) => excerpts[n - 1])
    .filter(Boolean)
    .map((e, i) => ({
      label: String(i + 1),
      source_id: e.sourceId,
      kind: e.kind,
      ref_id: e.refId,
      quote: e.snippet.slice(0, 240),
    }));

  const ungrounded = excerpts.length === 0 || citations.length === 0;

  const { data: saved } = await ctx.db
    .from('chat_messages')
    .insert({
      user_id: ctx.userId,
      thread_id: threadId,
      role: 'assistant',
      content: result.text,
      citations,
      ungrounded,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
    })
    .select('id, created_at')
    .single();

  await ctx.db.from('chat_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
  await recordUsage(ctx.admin, ctx.userId, 'tutor_messages');

  return json({
    threadId,
    message: {
      id: saved?.id,
      role: 'assistant',
      content: result.text,
      citations,
      ungrounded,
      created_at: saved?.created_at,
    },
  });
}

/* -------------------------------------------------------------------------- */

type Excerpt = {
  sourceId: string | null;
  kind: string;
  refId: string | null;
  snippet: string;
};

async function retrieve(
  ctx: AuthedContext,
  query: string,
  spaceId: string,
  sourceId: string | null,
): Promise<Excerpt[]> {
  let embedding: number[] | null = null;
  try {
    embedding = await embed(query);
  } catch (error) {
    // Semantic search is an enhancement; lexical search still works without it.
    console.warn('embedding failed, falling back to lexical search', error);
  }

  const { data, error } = await ctx.db.rpc('search_content', {
    p_query: query,
    p_embedding: embedding ? JSON.stringify(embedding) : null,
    p_space_id: spaceId,
    p_limit: MAX_EXCERPTS * 2,
  });

  if (error) {
    console.error('retrieval failed', error.message);
    return [];
  }

  const rows = (data ?? []) as {
    source_id: string | null;
    kind: string;
    ref_id: string | null;
    snippet: string;
    score: number;
  }[];

  return rows
    // A student who narrowed the conversation to one source expects answers
    // from that source only.
    .filter((r) => (sourceId ? r.source_id === sourceId : true))
    .filter((r) => r.score > 0.15)
    .slice(0, MAX_EXCERPTS)
    .map((r) => ({
      sourceId: r.source_id,
      kind: r.kind,
      refId: r.ref_id,
      snippet: r.snippet,
    }));
}

async function loadHistory(ctx: AuthedContext, threadId: string) {
  const { data } = await ctx.db
    .from('chat_messages')
    .select('role, content')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(MAX_HISTORY);

  const rows = ((data ?? []) as { role: 'user' | 'assistant'; content: string }[]).reverse();

  // Drop the message we just inserted; it is added with the context block.
  if (rows.length > 0 && rows[rows.length - 1].role === 'user') rows.pop();

  return rows.map((m) => ({ role: m.role, content: m.content }));
}

async function loadWeakConcepts(ctx: AuthedContext, spaceId: string): Promise<string[]> {
  const { data } = await ctx.db
    .from('concepts')
    .select('name, mastery, mastery_updated_at')
    .eq('space_id', spaceId)
    .not('mastery_updated_at', 'is', null)
    .lt('mastery', 0.5)
    .order('mastery', { ascending: true })
    .limit(5);

  return ((data ?? []) as { name: string }[]).map((c) => c.name);
}

async function ensureThread(
  ctx: AuthedContext,
  body: TutorBody,
  spaceName: string,
): Promise<string> {
  if (body.threadId) {
    const { data } = await ctx.db
      .from('chat_threads')
      .select('id')
      .eq('id', body.threadId)
      .maybeSingle();
    if (data) return data.id;
  }

  // Name the thread from the opening question so the list is scannable later.
  let title = body.message.trim().slice(0, 60);
  try {
    const named = await generateText({
      system:
        'Write a 3-6 word title for a study conversation that opens with this question. ' +
        'No quotes, no trailing period. Use the same language as the question.',
      messages: [{ role: 'user', content: body.message.trim().slice(0, 500) }],
      model: MODEL_FAST,
      maxTokens: 40,
      effort: 'low',
      think: false,
    });
    if (named.text.trim()) title = named.text.trim().replace(/^["']|["']$/g, '').slice(0, 80);
  } catch {
    // A generic title is a fine outcome; never fail the message over it.
  }

  const { data, error } = await ctx.db
    .from('chat_threads')
    .insert({
      user_id: ctx.userId,
      space_id: body.spaceId,
      source_id: body.sourceId ?? null,
      title: title || `About ${spaceName}`,
      mode: body.mode ?? 'explain',
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new FunctionError('internal', 'Could not start that conversation.', error?.message);
  }
  return data.id;
}
