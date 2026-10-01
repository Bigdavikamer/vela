# Vela

**Study by a clearer light.**

Vela turns lectures, PDFs, videos and pasted text into structured study material —
and then actually helps you learn it: spaced-repetition cards built around
concepts, quizzes that explain every wrong answer, a tutor that reasons across
your whole subject, and exam plans built from what you have actually mastered.

The name is Latin/Portuguese for *candle* (and *sail*, and a constellation). It
is phonetic in every language the app ships in, and it gives the product its
visual world: warm light in a dark, quiet room.

---

## What makes it different

This was built by studying the category — Coconote, Knowt, StudyFetch, Quizlet,
NotebookLM — and treating the recurring complaints as the requirements list.

| Common complaint | What Vela does |
|---|---|
| Notes can't be edited or exported | Notes are structured **blocks**, each editable, with Markdown export and copy-out |
| Flashcards go stale after you fix a note | A **derivation graph** tracks what each card was built from; edits mark cards stale and offer regeneration — never overwriting cards you edited |
| Chat is stuck on one note | The tutor retrieves across the **whole study space**, so "what do I need for the exam" draws on every lecture and PDF |
| Quizzes capped at silly lengths | 1–100 questions, your choice. Uncapped on both plans |
| PDFs flattened to text, diagrams lost | PDFs go to Claude **natively**, page by page, so figures and tables keep their meaning |
| Material silently translated | Language defaults to **"match the source"**, asked during onboarding and changeable in Settings |
| Weak search | Semantic search over everything (`gte-small` embeddings, hybrid with trigram), resolving to a note, page, or timestamp |
| Can't tell what you don't know | **Mastery lives on the concept**, blended from card grades and quiz answers, and drives weak-area review and exam readiness |
| Subscription dark patterns | No countdown timers, no fake urgency, no disguised close button. The free tier is described next to the paid one, and cancellation is two taps to Stripe's own portal |

---

## Architecture

```
Expo app (React Native, expo-router)
  │
  ├── Supabase Postgres ── RLS on every user-owned table
  ├── Supabase Storage ─── private buckets, signed URLs only
  │
  └── Edge Functions (Deno)
        ├── api      ── tutor, quizzes, grading, regeneration, exam plans, search, billing
        ├── ingest   ── the capture pipeline (isolated: it runs for minutes)
        └── stripe-webhook ── the ONLY writer of entitlement
```

**No AI or payment secret ever reaches the client.** The app holds only the
Supabase URL and its publishable key.

### The pipeline

```
input → extract → transcribe → structure → concepts → materials → index
```

Each stage writes its result before the next begins and records progress on the
`sources` row, so a failure late in the run never costs you the transcript and
notes that already succeeded. The request returns immediately and the app follows
progress over Realtime.

### Key decisions

- **Claude (`claude-opus-5`)** for all reasoning, with `output_config.format`
  JSON-schema outputs so malformed generations can never reach the database.
  Every prompt is grounded: use only the source, say when it is insufficient,
  never invent.
- **FSRS-6** (`ts-fsrs`) for scheduling — the best-evidenced open algorithm,
  rather than an invented interval scheme. Grading runs on-device so a review
  session never stutters.
- **Embeddings run inside the Edge runtime** (`gte-small`, 384-dim), so semantic
  search costs nothing per query and your material is never sent to a
  third-party embedding API.
- **Quiz grading is local** for multiple choice, true/false and matching. Only
  free text needs a model, and only free text pays for one.

---

## Project layout

```
app/                    expo-router routes
  (auth)/               welcome, sign in/up, password reset
  (onboarding)/         subject → goal → style+language → first capture
  (tabs)/               home, library, study, profile
  capture/              chooser, live recording, text, link
  source/[id]/          processing → study guide, transcript
  review/  quiz/  tutor/  exam/  focus/  settings/
src/
  components/           the design system
  services/             data + domain logic (one module per area)
  theme/                tokens, semantic colours, ThemeProvider
  i18n/                 en, pt-BR, es — typed, compile-checked
  lib/                  supabase client, typed API client, errors
supabase/
  migrations/           0001–0011, applied in order
  functions/            api, ingest, stripe-webhook, _shared
```

---

## Running it

```bash
npm install
npm start
```

`npm run typecheck` · `npm run lint` · `npm test`

The web target is useful for fast UI checks (`npx expo start --web`), but
recording and file pickers need a real device or simulator.

---

## Status

**Verified working**

- Database: 11 migrations applied; Supabase security advisor clean apart from
  four findings that are intentional and documented in `0010_harden.sql`.
- RLS proven by direct test: a second user sees **zero** rows of the first
  user's spaces, profiles or subscriptions.
- Cascade deletion proven: removing the auth user removes profile, preferences,
  subscription and all owned content — which is what `delete_my_account()` relies on.
- Three Edge Functions deployed and refusing unauthenticated calls correctly.
- Full sign-up → onboarding → capture → error-recovery flow driven end to end
  against the live backend in a browser.
- App boots and renders; 30 tests pass; typecheck clean; lint clean (0 errors).

**Needs your keys before the AI works** — see [`SETUP.md`](SETUP.md).

Nothing in this codebase fakes a result. If a provider is not configured, the
affected feature returns a clear "not configured" error and keeps your material,
rather than inventing study content.
