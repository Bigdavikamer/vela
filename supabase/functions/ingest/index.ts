import { FunctionError, handler } from '../_shared/http.ts';
import { authenticate, readJson } from '../_shared/supabase.ts';

import { processSource, type ProcessBody } from './process.ts';

/**
 * The capture pipeline, as its own function.
 *
 * Processing a lecture takes minutes and can hold a lot of a PDF in memory.
 * Isolating it means that work cannot crowd out the interactive routes in
 * `api` (tutor, quiz, search) or share their instance limits.
 */
Deno.serve(
  handler(async (req) => {
    const ctx = await authenticate(req);
    const body = await readJson<ProcessBody>(req);

    if (!body?.sourceId) throw new FunctionError('bad_request', 'sourceId is required.');

    return await processSource(ctx, body);
  }),
);
