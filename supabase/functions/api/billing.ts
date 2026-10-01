import Stripe from 'npm:stripe@^22';

import { getPlan, getUsage } from '../_shared/entitlements.ts';
import { FunctionError, json } from '../_shared/http.ts';
import type { AuthedContext } from '../_shared/supabase.ts';

/**
 * Subscriptions.
 *
 * The client never decides entitlement. It asks for a checkout URL, the student
 * pays on Stripe, and Stripe's webhook writes the `subscriptions` row using the
 * service role. Every plan check reads from that row.
 *
 * Checkout opens in the system browser rather than a WebView, so the student
 * sees Stripe's real URL and padlock, and so saved cards and wallets work.
 */

let cached: Stripe | null = null;

function stripe(): Stripe {
  if (cached) return cached;
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) {
    throw new FunctionError(
      'provider_unconfigured',
      'Payments are not set up for this deployment.',
      'Set the STRIPE_SECRET_KEY secret on the Supabase project.',
    );
  }
  // No apiVersion override: the SDK pins the version it was built against.
  cached = new Stripe(key);
  return cached;
}

function priceId(interval: 'month' | 'year'): string {
  const id = Deno.env.get(interval === 'month' ? 'STRIPE_PRICE_MONTHLY' : 'STRIPE_PRICE_YEARLY');
  if (!id) {
    throw new FunctionError(
      'provider_unconfigured',
      'That plan is not available yet.',
      `Set the STRIPE_PRICE_${interval === 'month' ? 'MONTHLY' : 'YEARLY'} secret.`,
    );
  }
  return id;
}

/* -------------------------------------------------------------------------- */
/* Checkout                                                                   */
/* -------------------------------------------------------------------------- */

export type CheckoutBody = { interval?: 'month' | 'year' };

export async function createCheckout(ctx: AuthedContext, body: CheckoutBody): Promise<Response> {
  const interval = body.interval ?? 'year';
  const client = stripe();

  const plan = await getPlan(ctx.db, ctx.userId);
  if (plan === 'plus') {
    throw new FunctionError('bad_request', 'You are already on Vela Plus.');
  }

  const customerId = await ensureCustomer(ctx, client);
  const baseUrl = Deno.env.get('WEB_BASE_URL') ?? 'https://vela.app';

  const session = await client.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId(interval), quantity: 1 }],
    // The user id travels with the subscription so the webhook can find the
    // account even if the Stripe customer was created out of band.
    client_reference_id: ctx.userId,
    subscription_data: { metadata: { user_id: ctx.userId } },
    metadata: { user_id: ctx.userId },
    allow_promotion_codes: true,
    success_url: `${baseUrl}/billing/done?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/billing/cancelled`,
  });

  if (!session.url) {
    throw new FunctionError('provider_failed', 'Stripe did not return a checkout link.');
  }

  return json({ url: session.url });
}

/* -------------------------------------------------------------------------- */
/* Portal                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The billing portal is where cancellation lives. It is two taps from Settings
 * and never hidden — the whole point of the pricing promise in the paywall.
 */
export async function createPortal(ctx: AuthedContext): Promise<Response> {
  const client = stripe();

  const { data: subscription } = await ctx.db
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', ctx.userId)
    .maybeSingle();

  if (!subscription?.stripe_customer_id) {
    throw new FunctionError('not_found', 'There is no subscription on this account yet.');
  }

  const baseUrl = Deno.env.get('WEB_BASE_URL') ?? 'https://vela.app';
  const session = await client.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: `${baseUrl}/billing/done`,
  });

  return json({ url: session.url });
}

/* -------------------------------------------------------------------------- */
/* Restore                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Reconciles this account against Stripe on demand.
 *
 * A student who reinstalls, or whose webhook was missed, presses "Restore" and
 * gets their plan back without contacting support. Recovering access must never
 * depend on an event we might have dropped.
 */
export async function restorePurchase(ctx: AuthedContext): Promise<Response> {
  const client = stripe();

  const { data: existing } = await ctx.db
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', ctx.userId)
    .maybeSingle();

  let customerId = existing?.stripe_customer_id ?? null;

  // Fall back to matching on the account's email.
  if (!customerId) {
    const { data: userData } = await ctx.db.auth.getUser();
    const email = userData.user?.email;
    if (email) {
      const found = await client.customers.list({ email, limit: 1 });
      customerId = found.data[0]?.id ?? null;
    }
  }

  if (!customerId) {
    return json({ restored: false, plan: 'free' });
  }

  const subscriptions = await client.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 10,
  });

  const active = subscriptions.data.find((s) =>
    ['active', 'trialing', 'past_due'].includes(s.status),
  );

  if (!active) {
    await ctx.admin
      .from('subscriptions')
      .update({ stripe_customer_id: customerId, plan: 'free', status: 'canceled' })
      .eq('user_id', ctx.userId);
    return json({ restored: false, plan: 'free' });
  }

  await writeSubscription(ctx, active, customerId);

  return json({ restored: true, plan: 'plus', status: active.status });
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

export async function billingStatus(ctx: AuthedContext): Promise<Response> {
  const [plan, usage] = await Promise.all([
    getPlan(ctx.db, ctx.userId),
    getUsage(ctx.db, ctx.userId),
  ]);

  const { data: subscription } = await ctx.db
    .from('subscriptions')
    .select('status, current_period_end, cancel_at_period_end, price_id, trial_end')
    .eq('user_id', ctx.userId)
    .maybeSingle();

  return json({ plan, usage, subscription: subscription ?? null });
}

/* -------------------------------------------------------------------------- */

async function ensureCustomer(ctx: AuthedContext, client: Stripe): Promise<string> {
  const { data: existing } = await ctx.db
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', ctx.userId)
    .maybeSingle();

  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  const { data: userData } = await ctx.db.auth.getUser();
  const customer = await client.customers.create({
    email: userData.user?.email ?? undefined,
    metadata: { user_id: ctx.userId },
  });

  await ctx.admin
    .from('subscriptions')
    .upsert(
      { user_id: ctx.userId, stripe_customer_id: customer.id },
      { onConflict: 'user_id' },
    );

  return customer.id;
}

/** Shared with the webhook so both paths write entitlement identically. */
export async function writeSubscription(
  ctx: Pick<AuthedContext, 'admin' | 'userId'>,
  subscription: Stripe.Subscription,
  customerId: string,
): Promise<void> {
  const item = subscription.items.data[0];
  const periodEnd = item?.current_period_end ?? null;

  await ctx.admin.from('subscriptions').upsert(
    {
      user_id: ctx.userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      plan: ['active', 'trialing', 'past_due'].includes(subscription.status) ? 'plus' : 'free',
      status: subscription.status,
      price_id: item?.price.id ?? null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      trial_end: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
}
