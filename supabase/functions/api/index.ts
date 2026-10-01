import { FunctionError, handler, json } from '../_shared/http.ts';
import { authenticate, readJson } from '../_shared/supabase.ts';

import {
  billingStatus,
  createCheckout,
  createPortal,
  restorePurchase,
  type CheckoutBody,
} from './billing.ts';
import { buildExamPlan, refreshReadiness, type ExamPlanBody, type ExamReadinessBody } from './exam.ts';
import { gradeAnswer, generateQuiz, type GradeBody, type QuizBody } from './quiz.ts';
import {
  getStale,
  refreshStale,
  rewriteBlock,
  type RefreshBody,
  type RewriteBody,
  type StaleBody,
} from './regenerate.ts';
import { search, type SearchBody } from './search.ts';
import { tutor, type TutorBody } from './tutor.ts';

/**
 * One authenticated API surface for everything that needs a server-held secret
 * or privileged access.
 *
 * A single function rather than a dozen keeps cold starts and the module cache
 * shared, and means the JWT check lives in exactly one place. The action name
 * arrives in the body, so adding a route cannot accidentally skip auth.
 */

type Envelope = { action: string; payload?: unknown };

Deno.serve(
  handler(async (req) => {
    const ctx = await authenticate(req);
    const { action, payload } = await readJson<Envelope>(req);

    if (!action) throw new FunctionError('bad_request', 'An action is required.');

    switch (action) {
      case 'tutor':
        return await tutor(ctx, payload as TutorBody);

      case 'generate_quiz':
        return await generateQuiz(ctx, payload as QuizBody);
      case 'grade_answer':
        return await gradeAnswer(ctx, payload as GradeBody);

      case 'stale_check':
        return await getStale(ctx, payload as StaleBody);
      case 'refresh_stale':
        return await refreshStale(ctx, payload as RefreshBody);
      case 'rewrite_block':
        return await rewriteBlock(ctx, payload as RewriteBody);

      case 'exam_plan':
        return await buildExamPlan(ctx, payload as ExamPlanBody);
      case 'exam_readiness':
        return await refreshReadiness(ctx, payload as ExamReadinessBody);

      case 'search':
        return await search(ctx, payload as SearchBody);

      case 'billing_status':
        return await billingStatus(ctx);
      case 'billing_checkout':
        return await createCheckout(ctx, (payload ?? {}) as CheckoutBody);
      case 'billing_portal':
        return await createPortal(ctx);
      case 'billing_restore':
        return await restorePurchase(ctx);

      case 'ping':
        return json({ ok: true, userId: ctx.userId });

      default:
        throw new FunctionError('bad_request', `Unknown action: ${action}`);
    }
  }),
);
