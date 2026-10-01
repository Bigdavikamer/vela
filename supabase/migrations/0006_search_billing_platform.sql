-- Vela :: 0006 :: semantic search, entitlements, sharing, and platform tables

-- ---------------------------------------------------------------------------
-- content_chunks : one embedding index over everything a student owns, so
-- searching "cell energy" finds ATP and mitochondria without the exact phrase.
--
-- 384 dimensions = gte-small, which runs inside the Edge Function runtime. That
-- keeps semantic search free of any third-party key. `embedding_model` is
-- recorded per row so a future upgrade can re-embed incrementally.
-- ---------------------------------------------------------------------------
create table if not exists public.content_chunks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  space_id   uuid not null references public.study_spaces(id) on delete cascade,
  source_id  uuid references public.sources(id) on delete cascade,
  kind       text not null check (kind in ('transcript','note','document','concept')),
  -- id of the transcript_segment / note_block / document_page / concept
  ref_id     uuid,
  text       text not null,
  embedding  extensions.vector(384),
  embedding_model text not null default 'gte-small',
  token_count int,
  created_at timestamptz not null default now()
);

create index if not exists content_chunks_space_idx on public.content_chunks (space_id);
create index if not exists content_chunks_ref_idx   on public.content_chunks (kind, ref_id);
create index if not exists content_chunks_text_idx
  on public.content_chunks using gin (text extensions.gin_trgm_ops);

-- IVFFlat needs training data to be worthwhile; HNSW is correct from row one.
create index if not exists content_chunks_embedding_idx
  on public.content_chunks using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- subscriptions : the server is the only authority on entitlement.
-- The client never writes here; only the Stripe webhook does.
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  plan                   text not null default 'free' check (plan in ('free','plus')),
  status                 text not null default 'inactive' check (status in
                           ('inactive','trialing','active','past_due','canceled','incomplete','unpaid')),
  price_id               text,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  trial_end              timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- raw webhook ledger: idempotency + an audit trail when billing is disputed
create table if not exists public.stripe_events (
  id           text primary key,
  type         text not null,
  payload      jsonb not null,
  processed_at timestamptz,
  error        text,
  received_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- usage_counters : free-tier metering, per calendar month
-- ---------------------------------------------------------------------------
create table if not exists public.usage_counters (
  user_id           uuid not null references auth.users(id) on delete cascade,
  period_start      date not null,
  sources_processed int not null default 0,
  minutes_captured  numeric(10,2) not null default 0,
  tutor_messages    int not null default 0,
  quizzes_generated int not null default 0,
  updated_at        timestamptz not null default now(),
  primary key (user_id, period_start)
);

-- ---------------------------------------------------------------------------
-- share_links : private by default. A link exposes exactly one resource --
-- never the space around it.
-- ---------------------------------------------------------------------------
create table if not exists public.share_links (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  resource_type text not null check (resource_type in ('note','deck','quiz_set')),
  resource_id   uuid not null,
  token         text not null unique,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  view_count    int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists share_links_resource_idx on public.share_links (resource_type, resource_id);

-- ---------------------------------------------------------------------------
-- platform
-- ---------------------------------------------------------------------------
create table if not exists public.analytics_events (
  id         bigserial primary key,
  user_id    uuid references auth.users(id) on delete set null,
  name       text not null,
  -- product properties only; no free-text user content, ever
  props      jsonb not null default '{}'::jsonb,
  platform   text,
  app_version text,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_name_idx on public.analytics_events (name, created_at desc);

create table if not exists public.push_tokens (
  token      text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  platform   text not null check (platform in ('ios','android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

create table if not exists public.feedback_reports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('ai_quality','transcription','billing','bug','other')),
  message    text not null,
  -- ids and app state only, so support can reproduce without reading material
  context    jsonb not null default '{}'::jsonb,
  status     text not null default 'open' check (status in ('open','triaged','resolved')),
  created_at timestamptz not null default now()
);

create index if not exists feedback_reports_user_idx on public.feedback_reports (user_id, created_at desc);
