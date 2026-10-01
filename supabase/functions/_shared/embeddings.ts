/**
 * Semantic search embeddings.
 *
 * Uses `gte-small`, which runs inside the Edge Function runtime itself. That
 * matters for two reasons: semantic search costs nothing per query, and the
 * student's study material is never sent to a third-party embedding API just to
 * make search work.
 *
 * 384 dimensions, matching content_chunks.embedding.
 */

// Provided by the Supabase Edge Runtime.
declare const Supabase: {
  ai: {
    Session: new (model: string) => {
      run(
        input: string,
        options?: { mean_pool?: boolean; normalize?: boolean },
      ): Promise<number[]>;
    };
  };
};

export const EMBEDDING_MODEL = 'gte-small';
export const EMBEDDING_DIMS = 384;

let session: InstanceType<typeof Supabase.ai.Session> | null = null;

function getSession() {
  if (!session) session = new Supabase.ai.Session(EMBEDDING_MODEL);
  return session;
}

export async function embed(text: string): Promise<number[]> {
  const cleaned = text.replace(/\s+/g, ' ').trim().slice(0, 8000);
  if (!cleaned) return new Array(EMBEDDING_DIMS).fill(0);
  return await getSession().run(cleaned, { mean_pool: true, normalize: true });
}

/** Embeds sequentially; the runtime session is not safe to fan out across. */
export async function embedAll(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const text of texts) out.push(await embed(text));
  return out;
}

/* -------------------------------------------------------------------------- */
/* Chunking                                                                   */
/* -------------------------------------------------------------------------- */

export type Chunk = { text: string; refId: string | null };

/**
 * Splits text into overlapping chunks on sentence boundaries.
 *
 * The overlap matters: a definition that straddles a chunk edge would otherwise
 * be unfindable, which is exactly the kind of gap that makes search feel
 * unreliable.
 */
export function chunkText(text: string, targetChars = 1200, overlapChars = 180): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= targetChars) return clean ? [clean] : [];

  // Split on sentence enders, keeping the punctuation.
  const sentences = clean.match(/[^.!?…]+[.!?…]+[\s]*|[^.!?…]+$/g) ?? [clean];

  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > targetChars && current.length > 0) {
      chunks.push(current.trim());
      const tail = current.slice(-overlapChars);
      // resume from a word boundary so the overlap is readable
      const boundary = tail.indexOf(' ');
      current = (boundary >= 0 ? tail.slice(boundary + 1) : '') + sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks;
}

/** Groups transcript segments into chunks while keeping segment provenance. */
export function chunkSegments(
  segments: { id: string; text: string }[],
  targetChars = 1200,
): { text: string; segmentIds: string[] }[] {
  const chunks: { text: string; segmentIds: string[] }[] = [];
  let text = '';
  let ids: string[] = [];

  for (const segment of segments) {
    if (text.length + segment.text.length > targetChars && text.length > 0) {
      chunks.push({ text: text.trim(), segmentIds: ids });
      text = '';
      ids = [];
    }
    text += `${segment.text} `;
    ids.push(segment.id);
  }
  if (text.trim()) chunks.push({ text: text.trim(), segmentIds: ids });

  return chunks;
}
