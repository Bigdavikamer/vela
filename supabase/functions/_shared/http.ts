/**
 * Shared HTTP plumbing for every Vela Edge Function.
 *
 * One error shape, one CORS policy, one auth path -- so a client never has to
 * guess what a failure means, and no function can accidentally skip the JWT
 * check.
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-vela-platform, x-vela-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Error codes the app knows how to render and recover from. */
export type ErrorCode =
  | 'bad_request'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'quota_exceeded'
  | 'provider_unconfigured'
  | 'provider_failed'
  | 'unsupported_media'
  | 'too_large'
  | 'timeout'
  | 'internal';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  quota_exceeded: 402,
  provider_unconfigured: 503,
  provider_failed: 502,
  unsupported_media: 415,
  too_large: 413,
  timeout: 504,
  internal: 500,
};

export class FunctionError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    /** safe, non-sensitive detail for the support/debug path */
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'FunctionError';
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof FunctionError) {
    return json({ error: { code: error.code, message: error.message, detail: error.detail } },
      STATUS[error.code]);
  }
  // Never leak an internal stack to the client; the log keeps the detail.
  console.error('unhandled error', error);
  return json(
    { error: { code: 'internal', message: 'Something broke on our side.' } },
    500,
  );
}

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return null;
}

/** Wraps a handler with CORS, method checking, and uniform error mapping. */
export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const pre = preflight(req);
    if (pre) return pre;
    try {
      if (req.method !== 'POST') {
        throw new FunctionError('bad_request', 'Use POST.');
      }
      return await fn(req);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
