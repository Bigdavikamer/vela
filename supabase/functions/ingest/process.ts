import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { generateJson, imageBlock, pdfBlock, textBlock } from '../_shared/ai.ts';
import { chunkSegments, chunkText, embed, EMBEDDING_MODEL } from '../_shared/embeddings.ts';
import { assertWithinQuota, recordUsage } from '../_shared/entitlements.ts';
import { FunctionError, json } from '../_shared/http.ts';
import {
  conceptsSystem,
  flashcardsSystem,
  notesSystem,
} from '../_shared/prompts.ts';
import {
  conceptsSchema,
  documentSchema,
  flashcardsSchema,
  notesSchema,
  validateCards,
  type ExtractedDocument,
  type GeneratedCards,
  type GeneratedConcepts,
  type GeneratedNotes,
} from '../_shared/schemas.ts';
import type { AuthedContext } from '../_shared/supabase.ts';
import { getTranscriptionProvider } from '../_shared/transcription.ts';

/**
 * The capture pipeline.
 *
 *   input -> extract -> transcribe -> structure -> concepts -> materials -> index
 *
 * Two properties matter more than anything else here:
 *
 *  1. RESUMABILITY. Each stage writes its result before the next begins, and the
 *     source row records which stage it reached. A failure at "materials" does
 *     not cost the student their transcript and notes -- retrying resumes from
 *     the last completed stage.
 *
 *  2. IT RETURNS IMMEDIATELY. Processing a lecture takes minutes, which is far
 *     longer than an HTTP request should live. The request starts the work in
 *     the background and returns; the app follows progress on the `sources` row
 *     over Realtime and is free to navigate away.
 */

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const MAX_PDF_PAGES = 200;
const MAX_FILE_BYTES = 100 * 1024 * 1024;

export type ProcessBody = { sourceId: string };
type Body = ProcessBody;

type Stage = 'extract' | 'transcribe' | 'structure' | 'concepts' | 'materials' | 'done';

const STAGE_PROGRESS: Record<Stage, number> = {
  extract: 10,
  transcribe: 30,
  structure: 55,
  concepts: 75,
  materials: 90,
  done: 100,
};

type SourceRow = {
  id: string;
  user_id: string;
  space_id: string;
  kind: string;
  title: string;
  status: string;
  stage: Stage | null;
  storage_path: string | null;
  external_url: string | null;
  inline_text: string | null;
  mime_type: string | null;
  duration_ms: number | null;
  language: string | null;
  attempts: number;
};

export async function processSource(ctx: AuthedContext, body: Body): Promise<Response> {
  const { sourceId } = body;

  if (!sourceId) throw new FunctionError('bad_request', 'sourceId is required.');

  const { data: source, error } = await ctx.db
    .from('sources')
    .select('*')
    .eq('id', sourceId)
    .maybeSingle();

  if (error || !source) throw new FunctionError('not_found', 'That material no longer exists.');

  const row = source as SourceRow;
  if (row.status === 'processing') {
    return json({ ok: true, status: 'processing', message: 'Already running.' });
  }

  // Metered before any work starts, so a student is never billed attention for
  // a job that will be rejected at the end.
  await assertWithinQuota(ctx.db, ctx.userId, 'sources_processed');
  if (row.duration_ms) {
    await assertWithinQuota(ctx.db, ctx.userId, 'minutes_captured', row.duration_ms / 60000);
  }

  await ctx.db
    .from('sources')
    .update({
      status: 'processing',
      stage: 'extract',
      progress: 5,
      error_code: null,
      error_message: null,
      attempts: row.attempts + 1,
    })
    .eq('id', sourceId);

  EdgeRuntime.waitUntil(runPipeline(ctx, row));

  return json({ ok: true, status: 'processing' });
}

/* -------------------------------------------------------------------------- */
/* Orchestration                                                              */
/* -------------------------------------------------------------------------- */

async function runPipeline(ctx: AuthedContext, source: SourceRow) {
  const admin = ctx.admin;
  const profile = await loadProfile(admin, ctx.userId);

  try {
    // ---- extract / transcribe --------------------------------------------
    await setStage(admin, source.id, 'extract');
    const extracted = await extract(ctx, source, profile.contentLanguage);

    if (!extracted.text.trim()) {
      throw new FunctionError(
        'unsupported_media',
        'Vela could not find any readable content in that.',
        `kind=${source.kind}`,
      );
    }

    await admin
      .from('sources')
      .update({ language: extracted.language, page_count: extracted.pageCount })
      .eq('id', source.id);

    // ---- structure --------------------------------------------------------
    await setStage(admin, source.id, 'structure');
    const notes = await generateNotes(source, extracted, profile.contentLanguage);
    const { noteId, blockIds } = await saveNotes(admin, source, notes);

    // ---- concepts ---------------------------------------------------------
    await setStage(admin, source.id, 'concepts');
    const concepts = await generateConcepts(source, extracted, profile.contentLanguage);
    const conceptIdsByName = await saveConcepts(admin, source, concepts, blockIds);

    // ---- materials --------------------------------------------------------
    await setStage(admin, source.id, 'materials');
    const cards = await generateFlashcards(source, extracted, concepts, profile.contentLanguage);
    await saveFlashcards(admin, source, cards, conceptIdsByName, blockIds, noteId);

    // ---- search index -----------------------------------------------------
    await indexForSearch(admin, source, extracted, notes, noteId);

    await admin
      .from('sources')
      .update({
        status: 'ready',
        stage: 'done',
        progress: 100,
        processed_at: new Date().toISOString(),
        title: source.title === 'Untitled' ? notes.title : source.title,
      })
      .eq('id', source.id);

    await recordUsage(admin, ctx.userId, 'sources_processed');
    if (source.duration_ms) {
      await recordUsage(admin, ctx.userId, 'minutes_captured', source.duration_ms / 60000);
    }
  } catch (error) {
    const code = error instanceof FunctionError ? error.code : 'internal';
    const message =
      error instanceof FunctionError
        ? error.message
        : 'Processing stopped unexpectedly. Your material is safe.';

    console.error('pipeline failed', { sourceId: source.id, code, error });

    await admin
      .from('sources')
      .update({ status: 'failed', error_code: code, error_message: message })
      .eq('id', source.id);

    await admin.from('job_runs').insert({
      user_id: source.user_id,
      source_id: source.id,
      stage: 'pipeline',
      status: 'failed',
      error_code: code,
      error_detail: error instanceof FunctionError ? error.detail : String(error).slice(0, 500),
      finished_at: new Date().toISOString(),
    });
  }
}

async function setStage(admin: SupabaseClient, sourceId: string, stage: Stage) {
  await admin
    .from('sources')
    .update({ stage, progress: STAGE_PROGRESS[stage] })
    .eq('id', sourceId);
}

async function loadProfile(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from('profiles')
    .select('content_language')
    .eq('id', userId)
    .maybeSingle();
  return { contentLanguage: (data?.content_language as string | null) ?? null };
}

/* -------------------------------------------------------------------------- */
/* Extraction                                                                 */
/* -------------------------------------------------------------------------- */

type Extracted = {
  /** flat text used for generation prompts and the search index */
  text: string;
  language: string | null;
  pageCount: number | null;
  /** present for audio/video */
  segments: { id: string; text: string }[];
  /** present for documents */
  pages: ExtractedDocument['pages'];
};

async function extract(
  ctx: AuthedContext,
  source: SourceRow,
  contentLanguage: string | null,
): Promise<Extracted> {
  switch (source.kind) {
    case 'text':
      return {
        text: source.inline_text ?? '',
        language: source.language,
        pageCount: null,
        segments: [],
        pages: [],
      };

    case 'url':
    case 'youtube':
      return await extractFromUrl(source);

    case 'recording':
    case 'audio':
    case 'video':
      return await extractFromAudio(ctx, source);

    case 'pdf':
    case 'document':
      return await extractFromDocument(ctx, source, contentLanguage);

    case 'image':
      return await extractFromImage(ctx, source, contentLanguage);

    default:
      throw new FunctionError('unsupported_media', `Vela cannot read ${source.kind} yet.`);
  }
}

async function downloadSource(ctx: AuthedContext, source: SourceRow): Promise<Blob> {
  if (!source.storage_path) {
    throw new FunctionError('bad_request', 'That material has no file attached.');
  }
  const { data, error } = await ctx.admin.storage.from('sources').download(source.storage_path);
  if (error || !data) {
    throw new FunctionError(
      'not_found',
      'Vela could not open that file.',
      error?.message ?? 'download failed',
    );
  }
  if (data.size > MAX_FILE_BYTES) {
    throw new FunctionError('too_large', 'That file is larger than Vela can process.');
  }
  return data;
}

async function extractFromAudio(ctx: AuthedContext, source: SourceRow): Promise<Extracted> {
  await setStage(ctx.admin, source.id, 'transcribe');

  const provider = getTranscriptionProvider();
  const blob = await downloadSource(ctx, source);
  const filename = source.storage_path?.split('/').pop() ?? 'audio.m4a';

  const result = await provider.transcribe(blob, filename, source.language);

  const { data: transcript, error } = await ctx.admin
    .from('transcripts')
    .upsert(
      {
        user_id: source.user_id,
        source_id: source.id,
        language: result.language,
        provider: result.provider,
        model: result.model,
        full_text: result.fullText,
        word_count: result.fullText.split(/\s+/).filter(Boolean).length,
      },
      { onConflict: 'source_id' },
    )
    .select('id')
    .single();

  if (error || !transcript) {
    throw new FunctionError('internal', 'Could not save the transcript.', error?.message);
  }

  // Replace any segments from a previous attempt so a retry is idempotent.
  await ctx.admin.from('transcript_segments').delete().eq('transcript_id', transcript.id);

  const rows = result.segments.map((s) => ({
    user_id: source.user_id,
    transcript_id: transcript.id,
    idx: s.index,
    start_ms: s.startMs,
    end_ms: s.endMs,
    speaker: s.speaker,
    text: s.text,
  }));

  const saved: { id: string; text: string }[] = [];
  for (let i = 0; i < rows.length; i += 500) {
    const { data } = await ctx.admin
      .from('transcript_segments')
      .insert(rows.slice(i, i + 500))
      .select('id, text');
    if (data) saved.push(...(data as { id: string; text: string }[]));
  }

  return {
    text: result.fullText,
    language: result.language,
    pageCount: null,
    segments: saved,
    pages: [],
  };
}

async function extractFromDocument(
  ctx: AuthedContext,
  source: SourceRow,
  contentLanguage: string | null,
): Promise<Extracted> {
  const blob = await downloadSource(ctx, source);
  const isPdf = (source.mime_type ?? '').includes('pdf') || source.kind === 'pdf';

  if (!isPdf) {
    // Plain text and markdown documents need no model call to read.
    const text = await blob.text();
    return { text, language: source.language, pageCount: null, segments: [], pages: [] };
  }

  const base64 = await blobToBase64(blob);

  const extractedDoc = await generateJson<ExtractedDocument>({
    system: `Extract this document page by page, preserving its structure.

For each page: the readable prose in reading order, its headings, any tables as rows of
cells, and any figures or diagrams. For a figure, write what it actually SHOWS -- a
student who cannot see it should still be able to study from your description. Do not
skip diagrams; they are often the point of the page.

Skip page furniture: running headers, footers, page numbers, and copyright lines.
If a page is blank or unreadable, return it with empty text rather than omitting it, so
page numbers stay aligned with the original.

${contentLanguage ? `Write your descriptions in ${contentLanguage}.` : 'Write in the document\'s own language.'}
Set "language" to the BCP-47 code of the document's language.`,
    messages: [
      {
        role: 'user',
        content: [pdfBlock(base64), textBlock('Extract this document.')],
      },
    ],
    schema: documentSchema as unknown as Record<string, unknown>,
    maxTokens: 32000,
    effort: 'medium',
  });

  if (extractedDoc.pages.length > MAX_PDF_PAGES) {
    throw new FunctionError(
      'too_large',
      `That document has more than ${MAX_PDF_PAGES} pages. Split it and add the parts separately.`,
    );
  }

  await ctx.admin.from('document_pages').delete().eq('source_id', source.id);
  const pageRows = extractedDoc.pages.map((p) => ({
    user_id: source.user_id,
    source_id: source.id,
    page_number: p.page_number,
    text: p.text,
    headings: p.headings,
    tables: p.tables,
    figures: p.figures,
  }));
  for (let i = 0; i < pageRows.length; i += 100) {
    await ctx.admin.from('document_pages').insert(pageRows.slice(i, i + 100));
  }

  const text = extractedDoc.pages
    .map((p) => {
      const figures = p.figures.map((f) => `[Figure: ${f.caption} — ${f.description}]`).join('\n');
      const tables = p.tables
        .map((t) => `[Table: ${t.caption}]\n${t.rows.map((r) => r.join(' | ')).join('\n')}`)
        .join('\n');
      return `--- Page ${p.page_number} ---\n${p.text}\n${tables}\n${figures}`.trim();
    })
    .join('\n\n');

  return {
    text,
    language: extractedDoc.language,
    pageCount: extractedDoc.pages.length,
    segments: [],
    pages: extractedDoc.pages,
  };
}

async function extractFromImage(
  ctx: AuthedContext,
  source: SourceRow,
  contentLanguage: string | null,
): Promise<Extracted> {
  const blob = await downloadSource(ctx, source);
  const base64 = await blobToBase64(blob);
  const mime = (source.mime_type ?? 'image/jpeg') as 'image/png' | 'image/jpeg' | 'image/webp';

  const result = await generateJson<ExtractedDocument>({
    system: `Read this image as study material. It is likely a lecture slide, a textbook
page, a whiteboard, or handwritten notes.

Transcribe all readable text faithfully, including handwriting. Describe any diagram in
enough detail that a student could study from the description alone. If part is
illegible, mark it "[illegible]" rather than guessing.

${contentLanguage ? `Write descriptions in ${contentLanguage}.` : 'Write in the language shown in the image.'}
Return it as a single page.`,
    messages: [
      { role: 'user', content: [imageBlock(base64, mime), textBlock('Read this.')] },
    ],
    schema: documentSchema as unknown as Record<string, unknown>,
    maxTokens: 8000,
    effort: 'medium',
  });

  const page = result.pages[0];
  const text = page
    ? `${page.text}\n${page.figures.map((f) => `[Figure: ${f.caption} — ${f.description}]`).join('\n')}`
    : '';

  return { text, language: result.language, pageCount: 1, segments: [], pages: result.pages };
}

async function extractFromUrl(source: SourceRow): Promise<Extracted> {
  if (!source.external_url) {
    throw new FunctionError('bad_request', 'No link was provided.');
  }

  let response: Response;
  try {
    response = await fetch(source.external_url, {
      headers: { 'User-Agent': 'VelaBot/1.0 (+https://vela.app)' },
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new FunctionError('provider_failed', 'Vela could not reach that link.');
  }

  if (!response.ok) {
    throw new FunctionError(
      'provider_failed',
      `That link returned an error (${response.status}). Check it opens in a browser.`,
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
    throw new FunctionError(
      'unsupported_media',
      'Vela can only read web pages and plain text from a link. Download the file and upload it instead.',
    );
  }

  const html = await response.text();
  const text = htmlToText(html);

  if (text.length < 200) {
    throw new FunctionError(
      'unsupported_media',
      'That page had almost no readable text. It may need JavaScript, or be behind a login.',
    );
  }

  return { text, language: source.language, pageCount: null, segments: [], pages: [] };
}

/** Minimal, dependency-free readability pass. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 200000);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Chunked to avoid blowing the argument limit on very large files.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/* -------------------------------------------------------------------------- */
/* Generation                                                                 */
/* -------------------------------------------------------------------------- */

/** The material, formatted for a prompt, with segment ids so blocks can cite. */
function sourceForPrompt(extracted: Extracted): string {
  if (extracted.segments.length > 0) {
    return extracted.segments.map((s) => `[${s.id}] ${s.text}`).join('\n');
  }
  return extracted.text;
}

async function generateNotes(
  source: SourceRow,
  extracted: Extracted,
  contentLanguage: string | null,
): Promise<GeneratedNotes> {
  const body = sourceForPrompt(extracted).slice(0, 400000);

  return await generateJson<GeneratedNotes>({
    system: notesSystem(contentLanguage, extracted.language),
    messages: [
      {
        role: 'user',
        content: `Build the study guide for this material.

${extracted.segments.length > 0
  ? 'This is a lecture transcript. Each line begins with its segment id in brackets — use those ids in source_ref.'
  : 'This is a document. Use the "--- Page N ---" markers to set the page in source_ref.'}

<material title="${escapeAttr(source.title)}">
${body}
</material>`,
      },
    ],
    schema: notesSchema as unknown as Record<string, unknown>,
    maxTokens: 24000,
    effort: 'high',
  });
}

async function generateConcepts(
  source: SourceRow,
  extracted: Extracted,
  contentLanguage: string | null,
): Promise<GeneratedConcepts> {
  return await generateJson<GeneratedConcepts>({
    system: conceptsSystem(contentLanguage, extracted.language),
    messages: [
      {
        role: 'user',
        content: `<material title="${escapeAttr(source.title)}">
${extracted.text.slice(0, 300000)}
</material>`,
      },
    ],
    schema: conceptsSchema as unknown as Record<string, unknown>,
    maxTokens: 8000,
    effort: 'high',
  });
}

async function generateFlashcards(
  source: SourceRow,
  extracted: Extracted,
  concepts: GeneratedConcepts,
  contentLanguage: string | null,
): Promise<GeneratedCards> {
  // Cards scale with how much the material actually teaches, not with a fixed
  // number that would pad thin material and starve dense material.
  const target = Math.min(60, Math.max(8, concepts.concepts.length * 3));

  return await generateJson<GeneratedCards>({
    system: flashcardsSystem(contentLanguage, extracted.language),
    messages: [
      {
        role: 'user',
        content: `Write about ${target} flashcards for this material.

Concepts in this material (use these exact names for concept_name):
${concepts.concepts.map((c) => `- ${c.name} (importance ${c.importance})`).join('\n')}

Weight coverage by importance: a 5 deserves several cards, a 1 may deserve none.

<material title="${escapeAttr(source.title)}">
${sourceForPrompt(extracted).slice(0, 300000)}
</material>`,
      },
    ],
    schema: flashcardsSchema as unknown as Record<string, unknown>,
    maxTokens: 24000,
    effort: 'high',
  });
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

async function saveNotes(
  admin: SupabaseClient,
  source: SourceRow,
  notes: GeneratedNotes,
): Promise<{ noteId: string; blockIds: Map<number, string> }> {
  const { data: note, error } = await admin
    .from('notes')
    .upsert(
      {
        user_id: source.user_id,
        space_id: source.space_id,
        source_id: source.id,
        title: notes.title,
        summary: notes.summary,
        language: notes.language,
        kind: 'source',
      },
      { onConflict: 'source_id' },
    )
    .select('id')
    .single();

  if (error || !note) {
    throw new FunctionError('internal', 'Could not save your notes.', error?.message);
  }

  // A regeneration replaces machine-written blocks but must never silently
  // delete something the student wrote or edited themselves.
  await admin
    .from('note_blocks')
    .delete()
    .eq('note_id', note.id)
    .eq('is_user_edited', false);

  const rows = notes.blocks.map((block, i) => ({
    user_id: source.user_id,
    note_id: note.id,
    position: i * 100,
    type: block.type,
    level: block.level,
    term: block.term,
    content: block.content,
    origin: block.origin,
    source_ref: {
      segment_ids: block.source_ref.segment_ids,
      page: block.source_ref.page,
      source_id: source.id,
    },
  }));

  const blockIds = new Map<number, string>();
  for (let i = 0; i < rows.length; i += 200) {
    const { data } = await admin
      .from('note_blocks')
      .insert(rows.slice(i, i + 200))
      .select('id, position');
    for (const b of (data ?? []) as { id: string; position: number }[]) {
      blockIds.set(b.position / 100, b.id);
    }
  }

  return { noteId: note.id, blockIds };
}

async function saveConcepts(
  admin: SupabaseClient,
  source: SourceRow,
  generated: GeneratedConcepts,
  blockIds: Map<number, string>,
): Promise<Map<string, string>> {
  const byName = new Map<string, string>();

  for (const concept of generated.concepts) {
    const normalized = concept.name.trim().toLowerCase();
    if (!normalized) continue;

    // Concepts are shared across a space: a second lecture on the same topic
    // strengthens the existing concept instead of creating a duplicate.
    const { data } = await admin
      .from('concepts')
      .upsert(
        {
          user_id: source.user_id,
          space_id: source.space_id,
          name: concept.name.trim(),
          normalized_name: normalized,
          definition: concept.definition,
          importance: concept.importance,
          first_source_id: source.id,
        },
        { onConflict: 'space_id,normalized_name', ignoreDuplicates: false },
      )
      .select('id')
      .single();

    if (data) byName.set(concept.name.trim(), data.id);
  }

  // Relationships, skipping any that reference a concept we did not store.
  const links = generated.links
    .map((link) => ({
      user_id: source.user_id,
      from_concept: byName.get(link.from.trim()),
      to_concept: byName.get(link.to.trim()),
      relation: link.relation,
    }))
    .filter((l) => l.from_concept && l.to_concept && l.from_concept !== l.to_concept);

  if (links.length > 0) {
    await admin.from('concept_links').upsert(links, {
      onConflict: 'from_concept,to_concept,relation',
      ignoreDuplicates: true,
    });
  }

  // Trace each concept to where it is discussed.
  const mentions = [...byName.values()].map((conceptId) => ({
    user_id: source.user_id,
    concept_id: conceptId,
    source_id: source.id,
    note_block_id: blockIds.get(0) ?? null,
  }));
  if (mentions.length > 0) await admin.from('concept_mentions').insert(mentions);

  return byName;
}

async function saveFlashcards(
  admin: SupabaseClient,
  source: SourceRow,
  generated: GeneratedCards,
  conceptIds: Map<string, string>,
  blockIds: Map<number, string>,
  _noteId: string,
): Promise<void> {
  const { cards, dropped } = validateCards(generated, new Set(conceptIds.keys()));
  if (dropped > 0) console.warn(`dropped ${dropped} malformed cards`, { sourceId: source.id });
  if (cards.length === 0) return;

  const { data: deck, error } = await admin
    .from('decks')
    .insert({
      user_id: source.user_id,
      space_id: source.space_id,
      source_id: source.id,
      title: source.title,
    })
    .select('id')
    .single();

  if (error || !deck) {
    throw new FunctionError('internal', 'Could not save your flashcards.', error?.message);
  }

  const rows = cards.map((card) => ({
    user_id: source.user_id,
    deck_id: deck.id,
    space_id: source.space_id,
    concept_id: card.concept_name ? (conceptIds.get(card.concept_name) ?? null) : null,
    front: card.front,
    back: card.back,
    explanation: card.explanation,
    tier: card.tier,
    source_ref: {
      segment_ids: card.source_ref.segment_ids,
      page: card.source_ref.page,
      source_id: source.id,
    },
  }));

  const { data: inserted } = await admin.from('flashcards').insert(rows).select('id');
  const insertedCards = (inserted ?? []) as { id: string }[];

  // Every card starts due now: a new card is a card you have not learned yet.
  if (insertedCards.length > 0) {
    await admin.from('card_states').insert(
      insertedCards.map((c) => ({
        card_id: c.id,
        user_id: source.user_id,
        due: new Date().toISOString(),
        state: 'new',
      })),
    );
  }

  // Record what each card was built from, so an edit to the note can tell us
  // exactly which cards went stale.
  const firstBlockId = blockIds.get(0);
  if (firstBlockId) {
    const { data: block } = await admin
      .from('note_blocks')
      .select('content_hash')
      .eq('id', firstBlockId)
      .maybeSingle();

    if (block) {
      await admin.from('derivations').insert(
        insertedCards.map((c) => ({
          user_id: source.user_id,
          derived_type: 'flashcard',
          derived_id: c.id,
          origin_type: 'note_block',
          origin_id: firstBlockId,
          origin_hash: block.content_hash,
        })),
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Search index                                                               */
/* -------------------------------------------------------------------------- */

async function indexForSearch(
  admin: SupabaseClient,
  source: SourceRow,
  extracted: Extracted,
  notes: GeneratedNotes,
  _noteId: string,
) {
  await admin.from('content_chunks').delete().eq('source_id', source.id);

  type ChunkRow = {
    user_id: string;
    space_id: string;
    source_id: string;
    kind: string;
    ref_id: string | null;
    text: string;
    embedding: string;
    embedding_model: string;
  };

  const rows: ChunkRow[] = [];

  const push = async (kind: string, text: string, refId: string | null) => {
    if (text.trim().length < 20) return;
    const vector = await embed(text);
    rows.push({
      user_id: source.user_id,
      space_id: source.space_id,
      source_id: source.id,
      kind,
      ref_id: refId,
      text,
      embedding: JSON.stringify(vector),
      embedding_model: EMBEDDING_MODEL,
    });
  };

  if (extracted.segments.length > 0) {
    for (const chunk of chunkSegments(extracted.segments)) {
      await push('transcript', chunk.text, chunk.segmentIds[0] ?? null);
    }
  } else {
    for (const chunk of chunkText(extracted.text)) {
      await push('document', chunk, null);
    }
  }

  // Index the generated notes too: students search for the phrasing they read,
  // which is often the study guide's wording rather than the lecturer's.
  for (const block of notes.blocks) {
    const text = block.term ? `${block.term}: ${block.content}` : block.content;
    await push('note', text, null);
  }

  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await admin.from('content_chunks').insert(rows.slice(i, i + 100));
    if (error) console.error('chunk insert failed', error.message);
  }
}
