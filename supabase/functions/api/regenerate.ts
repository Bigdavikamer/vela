import { generateJson } from '../_shared/ai.ts';
import { FunctionError, json } from '../_shared/http.ts';
import { flashcardsSystem, GROUNDING_RULES, languageRule } from '../_shared/prompts.ts';
import { flashcardsSchema, validateCards, type GeneratedCards } from '../_shared/schemas.ts';
import type { AuthedContext } from '../_shared/supabase.ts';

/**
 * Keeping derived material honest after an edit.
 *
 * When a student corrects a note, any flashcard built from that passage is now
 * teaching the old version. Competitors leave those cards stale, so the student
 * revises from something they have already fixed. Vela tracks the derivation,
 * tells them what went out of date, and regenerates on request — never
 * silently, and never over the top of a card they edited themselves.
 */

export type StaleBody = { noteId: string };

export async function getStale(ctx: AuthedContext, body: StaleBody): Promise<Response> {
  const { noteId } = body;
  if (!noteId) throw new FunctionError('bad_request', 'noteId is required.');

  const blockIds = await noteBlockIds(ctx, noteId);
  if (blockIds.length === 0) return json({ cards: 0, questions: 0 });

  const { data } = await ctx.db
    .from('stale_derivations')
    .select('derived_type, derived_id')
    .in('origin_id', blockIds);

  const rows = (data ?? []) as { derived_type: string; derived_id: string }[];

  return json({
    cards: rows.filter((r) => r.derived_type === 'flashcard').length,
    questions: rows.filter((r) => r.derived_type === 'quiz_question').length,
  });
}

export type RefreshBody = { noteId: string };

export async function refreshStale(ctx: AuthedContext, body: RefreshBody): Promise<Response> {
  const { noteId } = body;
  if (!noteId) throw new FunctionError('bad_request', 'noteId is required.');

  const { data: note } = await ctx.db
    .from('notes')
    .select('id, space_id, source_id, title, language')
    .eq('id', noteId)
    .maybeSingle();
  if (!note) throw new FunctionError('not_found', 'That note no longer exists.');

  const blockIds = await noteBlockIds(ctx, noteId);
  const { data: staleRows } = await ctx.db
    .from('stale_derivations')
    .select('derived_type, derived_id')
    .in('origin_id', blockIds);

  const staleCardIds = ((staleRows ?? []) as { derived_type: string; derived_id: string }[])
    .filter((r) => r.derived_type === 'flashcard')
    .map((r) => r.derived_id);

  if (staleCardIds.length === 0) {
    return json({ replaced: 0, kept: 0, message: 'Everything is already up to date.' });
  }

  // A card the student edited is theirs. We flag it, we never overwrite it.
  const { data: existing } = await ctx.db
    .from('flashcards')
    .select('id, deck_id, is_user_edited, concept_id')
    .in('id', staleCardIds);

  const cards = (existing ?? []) as {
    id: string; deck_id: string; is_user_edited: boolean; concept_id: string | null;
  }[];
  const replaceable = cards.filter((c) => !c.is_user_edited);
  const kept = cards.length - replaceable.length;

  if (replaceable.length === 0) {
    return json({ replaced: 0, kept, message: 'Only cards you edited were affected; those were left alone.' });
  }

  const noteText = await noteAsText(ctx, noteId);
  const concepts = await conceptsForSpace(ctx, note.space_id);

  const { data: profile } = await ctx.db
    .from('profiles')
    .select('content_language')
    .eq('id', ctx.userId)
    .maybeSingle();

  const generated = await generateJson<GeneratedCards>({
    system: flashcardsSystem(profile?.content_language ?? null, note.language),
    messages: [
      {
        role: 'user',
        content: `The student edited this study guide, so ${replaceable.length} flashcards built
from it are now out of date. Write ${replaceable.length} replacement cards that reflect the
CURRENT text below. Do not carry over anything from the old version.

Concepts (use these exact names for concept_name):
${concepts.map((c) => `- ${c.name}`).join('\n')}

<study-guide title="${note.title.replace(/"/g, '&quot;')}">
${noteText.slice(0, 200000)}
</study-guide>`,
      },
    ],
    schema: flashcardsSchema as unknown as Record<string, unknown>,
    maxTokens: Math.min(24000, 2000 + replaceable.length * 600),
    effort: 'high',
  });

  const conceptIdByName = new Map(concepts.map((c) => [c.name, c.id]));
  const { cards: fresh } = validateCards(generated, new Set(conceptIdByName.keys()));

  if (fresh.length === 0) {
    throw new FunctionError(
      'provider_failed',
      'Vela could not rewrite those cards. Your existing cards were left untouched.',
    );
  }

  const deckId = replaceable[0].deck_id;
  const replaceableIds = replaceable.map((c) => c.id);

  // Delete first, then insert: card_states and derivations cascade, so no
  // orphan scheduling rows survive.
  await ctx.db.from('flashcards').delete().in('id', replaceableIds);

  const { data: inserted } = await ctx.db
    .from('flashcards')
    .insert(
      fresh.map((card) => ({
        user_id: ctx.userId,
        deck_id: deckId,
        space_id: note.space_id,
        concept_id: card.concept_name ? (conceptIdByName.get(card.concept_name) ?? null) : null,
        front: card.front,
        back: card.back,
        explanation: card.explanation,
        tier: card.tier,
        source_ref: { source_id: note.source_id, segment_ids: [], page: null },
        generation: 2,
      })),
    )
    .select('id');

  const newCards = (inserted ?? []) as { id: string }[];

  if (newCards.length > 0) {
    await ctx.db.from('card_states').insert(
      newCards.map((c) => ({
        card_id: c.id,
        user_id: ctx.userId,
        due: new Date().toISOString(),
        state: 'new',
      })),
    );

    // Re-anchor provenance to the current content, so these are not
    // immediately stale again.
    const { data: block } = await ctx.db
      .from('note_blocks')
      .select('id, content_hash')
      .eq('note_id', noteId)
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (block) {
      await ctx.db.from('derivations').insert(
        newCards.map((c) => ({
          user_id: ctx.userId,
          derived_type: 'flashcard',
          derived_id: c.id,
          origin_type: 'note_block',
          origin_id: block.id,
          origin_hash: block.content_hash,
        })),
      );
    }
  }

  return json({ replaced: newCards.length, kept });
}

/* -------------------------------------------------------------------------- */
/* Rewriting one block                                                        */
/* -------------------------------------------------------------------------- */

export type RewriteBody = {
  blockId: string;
  /** e.g. "simpler", "more detail", "add an example" */
  instruction?: string;
};

const rewriteSchema = {
  type: 'object',
  properties: {
    content: { type: 'string' },
    term: { type: ['string', 'null'] },
  },
  required: ['content', 'term'],
  additionalProperties: false,
} as const;

export async function rewriteBlock(ctx: AuthedContext, body: RewriteBody): Promise<Response> {
  const { blockId, instruction } = body;
  if (!blockId) throw new FunctionError('bad_request', 'blockId is required.');

  const { data: block } = await ctx.db
    .from('note_blocks')
    .select('id, note_id, type, term, content, position')
    .eq('id', blockId)
    .maybeSingle();
  if (!block) throw new FunctionError('not_found', 'That section no longer exists.');

  const { data: note } = await ctx.db
    .from('notes')
    .select('id, title, language')
    .eq('id', block.note_id)
    .maybeSingle();

  // Neighbouring blocks keep the rewrite consistent with what surrounds it.
  const { data: neighbours } = await ctx.db
    .from('note_blocks')
    .select('type, term, content, position')
    .eq('note_id', block.note_id)
    .gte('position', block.position - 300)
    .lte('position', block.position + 300)
    .order('position', { ascending: true });

  const { data: profile } = await ctx.db
    .from('profiles')
    .select('content_language')
    .eq('id', ctx.userId)
    .maybeSingle();

  const result = await generateJson<{ content: string; term: string | null }>({
    system: `${GROUNDING_RULES}

${languageRule(profile?.content_language ?? null, note?.language ?? null)}

You are rewriting ONE block of a student's study guide. Keep it the same kind of block
(a "${block.type}") and roughly the same scope — this is a rewrite, not an expansion into
a new section. Stay consistent with the surrounding blocks in voice and level of detail.

Do not introduce facts that are not already implied by the surrounding material.`,
    messages: [
      {
        role: 'user',
        content: `Study guide: ${note?.title ?? 'Untitled'}

Surrounding blocks:
${(neighbours ?? [])
  .map((n) => {
    const b = n as { type: string; term: string | null; content: string };
    return `[${b.type}] ${b.term ? `${b.term}: ` : ''}${b.content}`;
  })
  .join('\n')}

The block to rewrite:
[${block.type}] ${block.term ? `${block.term}: ` : ''}${block.content}

Instruction: ${instruction?.trim() || 'Rewrite it more clearly.'}`,
      },
    ],
    schema: rewriteSchema as unknown as Record<string, unknown>,
    maxTokens: 2000,
    effort: 'medium',
  });

  // This is a machine rewrite the student asked for, so it stays `ai` origin
  // and does NOT count as a hand edit.
  const { error } = await ctx.db
    .from('note_blocks')
    .update({ content: result.content, term: result.term })
    .eq('id', blockId);

  if (error) throw new FunctionError('internal', 'Could not save the rewrite.', error.message);

  await ctx.db.from('note_blocks').update({ is_user_edited: false }).eq('id', blockId);

  return json({ content: result.content, term: result.term });
}

/* -------------------------------------------------------------------------- */

async function noteBlockIds(ctx: AuthedContext, noteId: string): Promise<string[]> {
  const { data } = await ctx.db.from('note_blocks').select('id').eq('note_id', noteId);
  return ((data ?? []) as { id: string }[]).map((b) => b.id);
}

async function noteAsText(ctx: AuthedContext, noteId: string): Promise<string> {
  const { data } = await ctx.db
    .from('note_blocks')
    .select('type, term, content')
    .eq('note_id', noteId)
    .order('position', { ascending: true });

  return ((data ?? []) as { type: string; term: string | null; content: string }[])
    .map((b) => (b.type === 'heading' ? `\n## ${b.content}` : b.term ? `${b.term}: ${b.content}` : b.content))
    .join('\n');
}

async function conceptsForSpace(ctx: AuthedContext, spaceId: string) {
  const { data } = await ctx.db
    .from('concepts')
    .select('id, name')
    .eq('space_id', spaceId)
    .order('importance', { ascending: false })
    .limit(60);
  return (data ?? []) as { id: string; name: string }[];
}
