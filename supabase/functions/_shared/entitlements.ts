import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { FunctionError } from './http.ts';

/**
 * Entitlements are decided here, on the server, from the `subscriptions` table
 * that only the Stripe webhook can write. The client is never asked and never
 * trusted -- it only renders what this says.
 */

export type Plan = 'free' | 'plus';

export const FREE_LIMITS = {
  sourcesPerMonth: 5,
  captureMinutesPerMonth: 90,
  tutorMessagesPerMonth: 40,
} as const;

/** Statuses that grant access. `past_due` still does: we do not cut a student
 *  off mid-revision over a card that will probably retry successfully. */
const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

export async function getPlan(db: SupabaseClient, userId: string): Promise<Plan> {
  const { data } = await db
    .from('subscriptions')
    .select('plan, status, current_period_end')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return 'free';
  if (data.plan !== 'plus') return 'free';
  if (!ACTIVE_STATUSES.has(data.status)) return 'free';

  // A canceled subscription keeps working until the period it was paid for ends.
  if (data.current_period_end && new Date(data.current_period_end) < new Date()) {
    return 'free';
  }
  return 'plus';
}

export type UsageField =
  | 'sources_processed'
  | 'minutes_captured'
  | 'tutor_messages'
  | 'quizzes_generated';

function periodStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export async function getUsage(db: SupabaseClient, userId: string) {
  const { data } = await db
    .from('usage_counters')
    .select('*')
    .eq('user_id', userId)
    .eq('period_start', periodStart())
    .maybeSingle();

  return {
    sources_processed: data?.sources_processed ?? 0,
    minutes_captured: Number(data?.minutes_captured ?? 0),
    tutor_messages: data?.tutor_messages ?? 0,
    quizzes_generated: data?.quizzes_generated ?? 0,
  };
}

/**
 * Throws `quota_exceeded` when a free user is out of allowance.
 *
 * Quizzes and flashcards are deliberately NOT metered on either plan: capping
 * quiz length is one of the loudest complaints about the category, and we are
 * not going to reproduce it.
 */
export async function assertWithinQuota(
  db: SupabaseClient,
  userId: string,
  field: UsageField,
  amount = 1,
): Promise<Plan> {
  const plan = await getPlan(db, userId);
  if (plan === 'plus') return plan;

  const usage = await getUsage(db, userId);

  const check = (used: number, limit: number, message: string) => {
    if (used + amount > limit) throw new FunctionError('quota_exceeded', message);
  };

  switch (field) {
    case 'sources_processed':
      check(
        usage.sources_processed,
        FREE_LIMITS.sourcesPerMonth,
        `You have used all ${FREE_LIMITS.sourcesPerMonth} pieces of material included this month. Vela Plus removes the limit.`,
      );
      break;
    case 'minutes_captured':
      check(
        usage.minutes_captured,
        FREE_LIMITS.captureMinutesPerMonth,
        `You have used your ${FREE_LIMITS.captureMinutesPerMonth} recording minutes for this month. Vela Plus removes the limit.`,
      );
      break;
    case 'tutor_messages':
      check(
        usage.tutor_messages,
        FREE_LIMITS.tutorMessagesPerMonth,
        `You have used your ${FREE_LIMITS.tutorMessagesPerMonth} tutor messages for this month. Vela Plus removes the limit.`,
      );
      break;
    case 'quizzes_generated':
      // uncapped by design
      break;
  }

  return plan;
}

/** Records usage. Uses the admin client so it works from background work too. */
export async function recordUsage(
  admin: SupabaseClient,
  userId: string,
  field: UsageField,
  amount = 1,
): Promise<void> {
  const period = periodStart();

  await admin
    .from('usage_counters')
    .upsert({ user_id: userId, period_start: period }, { onConflict: 'user_id,period_start' });

  const { data } = await admin
    .from('usage_counters')
    .select(field)
    .eq('user_id', userId)
    .eq('period_start', period)
    .maybeSingle();

  const current = Number((data as Record<string, unknown> | null)?.[field] ?? 0);

  await admin
    .from('usage_counters')
    .update({ [field]: current + amount, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('period_start', period);
}
