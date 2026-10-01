import Stripe from 'npm:stripe@^22';

import { corsHeaders } from '../_shared/http.ts';
import { adminClient } from '../_shared/supabase.ts';

/**
 * Stripe webhook — the only writer of entitlement.
 *
 * Three rules this file exists to enforce:
 *
 *  1. The signature is verified before anything is read. An unsigned request is
 *     rejected outright; nobody grants themselves Plus by POSTing JSON here.
 *  2. Events are recorded and de-duplicated by id, because Stripe retries and
 *     the same event will arrive more than once.
 *  3. Failures return 500 so Stripe retries. Swallowing an error here means a
 *     student who paid silently stays on the free plan.
 *
 * Deployed with verify_jwt = false: Stripe cannot present a Supabase JWT. The
 * webhook signature is the authentication.
 */

const ACTIVE = ['active', 'trialing', 'past_due'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!secretKey || !webhookSecret) {
    console.error('stripe webhook not configured');
    return new Response('Not configured', { status: 503 });
  }

  const stripe = new Stripe(secretKey);

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });

  const body = await req.text();

  let event: Stripe.Event;
  try {
    // Async variant: Deno has no synchronous crypto for this.
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (error) {
    console.error('signature verification failed', error);
    return new Response('Invalid signature', { status: 400 });
  }

  const admin = adminClient();

  // Idempotency: if we have already processed this event id, acknowledge and stop.
  const { data: seen } = await admin
    .from('stripe_events')
    .select('id, processed_at')
    .eq('id', event.id)
    .maybeSingle();

  if (seen?.processed_at) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await admin.from('stripe_events').upsert({
    id: event.id,
    type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });

  try {
    await handleEvent(stripe, admin, event);

    await admin
      .from('stripe_events')
      .update({ processed_at: new Date().toISOString(), error: null })
      .eq('id', event.id);

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('webhook handling failed', { eventId: event.id, type: event.type, message });

    await admin.from('stripe_events').update({ error: message.slice(0, 500) }).eq('id', event.id);

    // 500 so Stripe retries. A dropped event means someone paid and did not
    // get what they paid for.
    return new Response('Handler failed', { status: 500 });
  }
});

type Admin = ReturnType<typeof adminClient>;

async function handleEvent(stripe: Stripe, admin: Admin, event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'subscription' || !session.subscription) return;

      const userId = await resolveUserId(admin, {
        clientReferenceId: session.client_reference_id,
        metadataUserId: session.metadata?.user_id,
        customerId: typeof session.customer === 'string' ? session.customer : null,
      });
      if (!userId) throw new Error(`No Vela user for checkout session ${session.id}`);

      const subscription = await stripe.subscriptions.retrieve(
        typeof session.subscription === 'string' ? session.subscription : session.subscription.id,
      );
      await writeSubscription(admin, userId, subscription);
      return;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = await resolveUserId(admin, {
        metadataUserId: subscription.metadata?.user_id,
        customerId:
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id,
      });
      if (!userId) throw new Error(`No Vela user for subscription ${subscription.id}`);

      await writeSubscription(admin, userId, subscription);
      return;
    }

    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      if (!customerId) return;

      const userId = await resolveUserId(admin, { customerId });
      if (!userId) return;

      // Re-read the subscription rather than inferring state from the invoice:
      // Stripe is the source of truth for status and period end.
      const subs = await stripe.subscriptions.list({ customer: customerId, limit: 1, status: 'all' });
      const subscription = subs.data[0];
      if (subscription) await writeSubscription(admin, userId, subscription);
      return;
    }

    default:
      // Unhandled event types are recorded and acknowledged, not errors.
      return;
  }
}

async function resolveUserId(
  admin: Admin,
  hints: { clientReferenceId?: string | null; metadataUserId?: string | null; customerId?: string | null },
): Promise<string | null> {
  if (hints.clientReferenceId) return hints.clientReferenceId;
  if (hints.metadataUserId) return hints.metadataUserId;

  if (hints.customerId) {
    const { data } = await admin
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', hints.customerId)
      .maybeSingle();
    if (data?.user_id) return data.user_id;
  }
  return null;
}

async function writeSubscription(
  admin: Admin,
  userId: string,
  subscription: Stripe.Subscription,
) {
  const item = subscription.items.data[0];
  const periodEnd = item?.current_period_end ?? null;
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  const { error } = await admin.from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      plan: ACTIVE.includes(subscription.status) ? 'plus' : 'free',
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

  if (error) throw new Error(`subscription upsert failed: ${error.message}`);
}
