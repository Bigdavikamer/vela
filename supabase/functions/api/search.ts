import { embed } from '../_shared/embeddings.ts';
import { FunctionError, json } from '../_shared/http.ts';
import type { AuthedContext } from '../_shared/supabase.ts';

/**
 * Cross-material search.
 *
 * Embedding happens here rather than on the device: the model runs in the Edge
 * runtime, so a phone does not carry it, and the query never leaves Supabase.
 * Results are resolved back to the thing the student recognises — a note, a
 * moment in a lecture, a page — not to an opaque chunk id.
 */

export type SearchBody = {
  query: string;
  spaceId?: string | null;
  limit?: number;
};

export async function search(ctx: AuthedContext, body: SearchBody): Promise<Response> {
  const query = (body.query ?? '').trim();
  if (query.length < 2) return json({ results: [] });

  const limit = Math.min(50, Math.max(1, body.limit ?? 25));

  let embedding: number[] | null = null;
  try {
    embedding = await embed(query);
  } catch (error) {
    // Lexical search still returns useful results; a degraded search beats none.
    console.warn('embedding failed; lexical only', error);
  }

  const { data, error } = await ctx.db.rpc('search_content', {
    p_query: query,
    p_embedding: embedding ? JSON.stringify(embedding) : null,
    p_space_id: body.spaceId ?? null,
    p_limit: limit,
  });

  if (error) throw new FunctionError('internal', 'Search failed.', error.message);

  const rows = (data ?? []) as {
    chunk_id: string;
    space_id: string;
    source_id: string | null;
    kind: string;
    ref_id: string | null;
    snippet: string;
    score: number;
  }[];

  const sourceIds = [...new Set(rows.map((r) => r.source_id).filter((id): id is string => !!id))];
  const spaceIds = [...new Set(rows.map((r) => r.space_id))];

  const [{ data: sources }, { data: spaces }] = await Promise.all([
    sourceIds.length
      ? ctx.db.from('sources').select('id, title, kind').in('id', sourceIds)
      : Promise.resolve({ data: [] as never[] }),
    spaceIds.length
      ? ctx.db.from('study_spaces').select('id, name, accent').in('id', spaceIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const sourceById = new Map(
    ((sources ?? []) as { id: string; title: string; kind: string }[]).map((s) => [s.id, s]),
  );
  const spaceById = new Map(
    ((spaces ?? []) as { id: string; name: string; accent: string }[]).map((s) => [s.id, s]),
  );

  // Resolve transcript hits to a timestamp so "play from here" works from search.
  const segmentIds = rows
    .filter((r) => r.kind === 'transcript' && r.ref_id)
    .map((r) => r.ref_id as string);

  const startBySegment = new Map<string, number>();
  if (segmentIds.length > 0) {
    const { data: segments } = await ctx.db
      .from('transcript_segments')
      .select('id, start_ms')
      .in('id', segmentIds);
    for (const s of (segments ?? []) as { id: string; start_ms: number }[]) {
      startBySegment.set(s.id, s.start_ms);
    }
  }

  const results = rows.map((r) => ({
    id: r.chunk_id,
    kind: r.kind,
    snippet: r.snippet,
    score: r.score,
    sourceId: r.source_id,
    sourceTitle: r.source_id ? (sourceById.get(r.source_id)?.title ?? null) : null,
    sourceKind: r.source_id ? (sourceById.get(r.source_id)?.kind ?? null) : null,
    spaceId: r.space_id,
    spaceName: spaceById.get(r.space_id)?.name ?? null,
    spaceAccent: spaceById.get(r.space_id)?.accent ?? null,
    startMs: r.ref_id ? (startBySegment.get(r.ref_id) ?? null) : null,
  }));

  return json({ results, semantic: embedding !== null });
}
