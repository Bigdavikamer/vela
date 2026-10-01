# Setup — what's done, and what needs you

Everything below that says **DONE** is already live on your Supabase project
`vela` (`zvyuayoviztlpxtjhkhp`, São Paulo).

---

## 0. DO THIS FIRST — turn off email confirmation

**Without this you cannot create an account at all.**

A brand-new Supabase project requires every sign-up to be confirmed by email, and
sends that email through Supabase's built-in SMTP, which is capped at a couple of
messages **per hour** for the whole project. Hit the cap and sign-up fails with
`over_email_send_rate_limit` — and Supabase *rolls the new user back*, so there is
not even a half-created account to rescue.

1. Open **[Authentication → Sign In / Providers](https://supabase.com/dashboard/project/zvyuayoviztlpxtjhkhp/auth/providers)**
2. Expand **Email**
3. Turn **Confirm email** off, and save

Sign-up then returns a session immediately, sends no email, and drops you straight
into onboarding. Password sign-in works normally.

The one thing that still needs email afterwards is the **"Email me a sign-in link"**
button and password reset — those are email by definition. Configure SMTP (step 3)
before relying on them, or before letting real users near the app.

---

## DONE — no action needed

| Thing | State |
|---|---|
| Supabase project | Created, `sa-east-1`, free tier ($0/month) |
| Schema | 11 migrations applied (`supabase/migrations/`) |
| RLS | On for every user-owned table; isolation verified by test |
| Storage buckets | `sources`, `derived`, `avatars` — all private, owner-scoped policies |
| Edge Functions | `api`, `ingest`, `stripe-webhook` deployed and responding |
| Realtime | `sources`, `notes`, `note_blocks` published; the app also polls as a fallback |
| App config | `.env` written with your project URL + publishable key |
| Stripe products | **Test mode**: `Vela Plus` with monthly and yearly prices |

---

## 1. AI keys (required — nothing generates without these)

Set these as **Edge Function secrets**, not in `.env`. They must never reach the app.

Dashboard → Project Settings → Edge Functions → Secrets, or:

```bash
npx supabase login
npx supabase link --project-ref zvyuayoviztlpxtjhkhp
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

| Secret | Why | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | All reasoning: notes, concepts, cards, quizzes, tutor, exam plans | Every AI feature returns "AI is not configured for this deployment" |
| `OPENAI_API_KEY` | **Speech-to-text only.** Claude has no audio input, so transcription needs a second provider | Recordings and audio/video uploads fail with a clear message; PDFs, images, text and links still work |

You said you have an Anthropic key — that one is the important one. For
`OPENAI_API_KEY` you can reuse the working key already in
`../followflow/.env`, or swap the provider: `supabase/functions/_shared/transcription.ts`
has a one-interface abstraction, so Deepgram or AssemblyAI is a small change.

---

## 2. Stripe (required only for paid plans)

**Test mode is set up.** These prices exist on your account right now:

```
Product  prod_V9VwADmmhCNj4s   Vela Plus
Monthly  price_1U9CuIJlP9MRqpN1qfXwNpAE   $8.99 / month
Yearly   price_1U9CuJJlP9MRqpN1U3JhtsrK   $59.99 / year
```

Pricing rationale: Knowt Ultra is $24.99/mo, StudyFetch $7.99/mo, and Coconote
was $59/year before Quizlet acquired it. This undercuts Knowt heavily, matches
Coconote's annual anchor, and still offers a real monthly option.

Set the secrets:

```bash
npx supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_PRICE_MONTHLY=price_1U9CuIJlP9MRqpN1qfXwNpAE \
  STRIPE_PRICE_YEARLY=price_1U9CuJJlP9MRqpN1U3JhtsrK \
  WEB_BASE_URL=https://vela.app
```

Then add the webhook in the Stripe dashboard:

- URL: `https://zvyuayoviztlpxtjhkhp.supabase.co/functions/v1/stripe-webhook`
- Events: `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`,
  `invoice.paid`, `invoice.payment_failed`
- Copy the signing secret → `npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`

**Live products were not created.** You approved it, but the Stripe MCP key
connected here is read-only (`PostProducts` was refused), and I will not invent
credentials. Create the same two prices in live mode from the dashboard, or grant
write access, and swap the secrets above for the `sk_live_` equivalents.

---

## 3. Auth email (SMTP)

Step 0 removes email from the sign-up path, but magic-link sign-in and password
reset still send mail. Before real users, add a custom SMTP provider under
**Authentication → Emails → SMTP Settings**. Resend works and there is already a
working `RESEND_API_KEY` in `../followflow/.env`.

Until then, expect those two flows to fail with the hourly-limit error. The app
now says so explicitly rather than telling you to "wait a minute".

---

## 4. Redeploying functions

The repo is the source of truth. The deployed copies were uploaded through the
management API and have minor comment-level drift from the files on disk. To
make them byte-identical, and for every future change:

```bash
npx supabase functions deploy api
npx supabase functions deploy ingest
npx supabase functions deploy stripe-webhook --no-verify-jwt
```

`--no-verify-jwt` on the webhook is required: Stripe cannot present a Supabase
JWT, so the webhook signature is its authentication.

---

## Known limitations, stated plainly

1. **Apple's rules on Stripe.** Selling a digital subscription inside an iOS app
   normally requires In-App Purchase. Vela opens Stripe Checkout in the system
   browser, which is the pattern permitted under external-purchase-link
   entitlements in some regions — but you should assume you need either an
   App Store entitlement or a StoreKit path before shipping to iOS. The
   entitlement system is deliberately server-side and provider-agnostic, so
   adding IAP means a new webhook writing the same `subscriptions` row.

2. **Ambient audio is not bundled.** The focus-mode ambience picker changes the
   visual atmosphere and is labelled in the UI as doing exactly that. Add loops
   to `assets/` and an `expo-audio` player to complete it.

3. **Push notifications are wired but not scheduled.** Preferences, the
   `push_tokens` table, and the opt-in UI exist; token registration and the
   send-side job do not.

4. **Not built for a device yet.** Verified through typecheck, the test suite,
   lint, and the web target. Recording, document picking and haptics need
   `npx expo run:ios` / `run:android` or an EAS build to exercise for real.

5. **Long PDFs are capped at 200 pages** per source, and uploads at 100 MB, with
   an explicit error rather than a silent truncation.
