import { supabase, toVelaError, VelaError, type VelaErrorCode } from './supabase';

/**
 * Client for the `api` Edge Function.
 *
 * Every privileged operation goes through one POST with an `action`, so the app
 * has exactly one place where a server error becomes a `VelaError` the UI knows
 * how to render.
 */

type ApiErrorShape = {
  error?: { code?: string; message?: string; detail?: string };
};

const FUNCTION_ERROR_MAP: Record<string, VelaErrorCode> = {
  bad_request: 'unknown',
  unauthenticated: 'unauthenticated',
  forbidden: 'forbidden',
  not_found: 'not_found',
  quota_exceeded: 'quota_exceeded',
  provider_unconfigured: 'provider_unconfigured',
  provider_failed: 'server',
  unsupported_media: 'unknown',
  too_large: 'unknown',
  timeout: 'timeout',
  internal: 'server',
};

/** Codes where retrying the identical request is pointless. */
const NON_RETRYABLE = new Set(['quota_exceeded', 'provider_unconfigured', 'forbidden', 'not_found']);

async function invoke<T>(fn: string, payload: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw new VelaError('Your session expired. Sign in again.', 'unauthenticated', false);
  }

  const { data, error } = await supabase.functions.invoke<T & ApiErrorShape>(fn, { body: payload });

  if (error) {
    // supabase-js surfaces a non-2xx as FunctionsHttpError with the body on
    // `context`. Read our structured error out of it so the user sees the real
    // reason rather than "Edge Function returned a non-2xx status code".
    const parsed = await readFunctionError(error);
    if (parsed) throw parsed;
    throw toVelaError(error);
  }

  const result = data as (T & ApiErrorShape) | null;
  if (result && typeof result === 'object' && 'error' in result && result.error) {
    throw fromShape(result.error);
  }
  return result as T;
}

/** Routes on the shared `api` function, addressed by action. */
function call<T>(action: string, payload?: unknown): Promise<T> {
  return invoke<T>('api', { action, payload });
}

async function readFunctionError(error: unknown): Promise<VelaError | null> {
  const context = (error as { context?: unknown }).context;
  if (!context) return null;
  try {
    const response = context as Response;
    if (typeof response.json !== 'function') return null;
    const body = (await response.json()) as ApiErrorShape;
    if (body?.error) return fromShape(body.error);
  } catch {
    // fall through to the generic mapping
  }
  return null;
}

function fromShape(shape: NonNullable<ApiErrorShape['error']>): VelaError {
  const code = FUNCTION_ERROR_MAP[shape.code ?? ''] ?? 'unknown';
  return new VelaError(
    shape.message ?? 'Something went wrong.',
    code,
    !NON_RETRYABLE.has(shape.code ?? ''),
    shape.detail,
  );
}

/* -------------------------------------------------------------------------- */
/* Typed actions                                                              */
/* -------------------------------------------------------------------------- */

export type TutorMode =
  | 'explain' | 'learn' | 'quiz_me' | 'test_me' | 'find_gaps' | 'summarize' | 'deep_dive';

export type QuizMode = 'quick' | 'standard' | 'long' | 'weak_areas' | 'exam_sim' | 'custom';

export type Citation = {
  label: string;
  source_id: string | null;
  kind: string;
  ref_id: string | null;
  quote: string;
};

export type SearchResult = {
  id: string;
  kind: string;
  snippet: string;
  score: number;
  sourceId: string | null;
  sourceTitle: string | null;
  sourceKind: string | null;
  spaceId: string;
  spaceName: string | null;
  spaceAccent: string | null;
  startMs: number | null;
};

export type BillingStatus = {
  plan: 'free' | 'plus';
  usage: {
    sources_processed: number;
    minutes_captured: number;
    tutor_messages: number;
    quizzes_generated: number;
  };
  subscription: {
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    price_id: string | null;
    trial_end: string | null;
  } | null;
};

export const api = {
  ping: () => call<{ ok: boolean; userId: string }>('ping'),

  // The pipeline is a separate function: it runs for minutes and must not
  // share instance limits with the interactive routes.
  processSource: (sourceId: string) =>
    invoke<{ ok: boolean; status: string }>('ingest', { sourceId }),

  tutor: (input: {
    threadId?: string;
    spaceId: string;
    sourceId?: string | null;
    mode?: TutorMode;
    message: string;
  }) =>
    call<{
      threadId: string;
      message: {
        id: string;
        role: 'assistant';
        content: string;
        citations: Citation[];
        ungrounded: boolean;
        created_at: string;
      };
    }>('tutor', input),

  generateQuiz: (input: {
    spaceId: string;
    sourceId?: string | null;
    examId?: string | null;
    mode?: QuizMode;
    count?: number;
    conceptIds?: string[];
  }) => call<{ quizSetId: string; questionCount: number; dropped: number }>('generate_quiz', input),

  gradeAnswer: (input: {
    questionId: string;
    attemptId: string;
    response: string;
    durationMs?: number;
  }) => call<{ correct: boolean; note: string; explanation: string | null }>('grade_answer', input),

  staleCheck: (noteId: string) =>
    call<{ cards: number; questions: number }>('stale_check', { noteId }),

  refreshStale: (noteId: string) =>
    call<{ replaced: number; kept: number; message?: string }>('refresh_stale', { noteId }),

  rewriteBlock: (input: { blockId: string; instruction?: string }) =>
    call<{ content: string; term: string | null }>('rewrite_block', input),

  examPlan: (examId: string) =>
    call<{ items: number; readiness: number; note: string | null; daysUntil: number }>(
      'exam_plan',
      { examId },
    ),

  examReadiness: (examId: string) => call<{ readiness: number }>('exam_readiness', { examId }),

  search: (input: { query: string; spaceId?: string | null; limit?: number }) =>
    call<{ results: SearchResult[]; semantic: boolean }>('search', input),

  billingStatus: () => call<BillingStatus>('billing_status'),
  billingCheckout: (interval: 'month' | 'year') =>
    call<{ url: string }>('billing_checkout', { interval }),
  billingPortal: () => call<{ url: string }>('billing_portal'),
  billingRestore: () =>
    call<{ restored: boolean; plan: 'free' | 'plus'; status?: string }>('billing_restore'),
};
