-- Vela :: 0002 :: capture -> transcript -> structured document
-- The ingest half of the pipeline. Nothing here is AI-generated except the
-- transcript; interpretation lives in 0003.

-- ---------------------------------------------------------------------------
-- sources : anything a student feeds the app
-- ---------------------------------------------------------------------------
create table if not exists public.sources (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  space_id      uuid not null references public.study_spaces(id) on delete cascade,
  kind          text not null check (kind in
                  ('recording','audio','video','pdf','document','text','url','youtube','image')),
  title         text not null default 'Untitled',

  -- Lifecycle. `stage` is the human-facing step; `status` is the machine state.
  status        text not null default 'draft' check (status in
                  ('draft','uploading','queued','processing','ready','failed','canceled')),
  stage         text check (stage in
                  ('upload','extract','transcribe','structure','concepts','materials','done')),
  progress      int  not null default 0 check (progress between 0 and 100),
  error_code    text,
  error_message text,
  attempts      int  not null default 0,

  -- Payload. Exactly one of storage_path / external_url / inline_text is set.
  storage_path  text,
  external_url  text,
  inline_text   text,

  mime_type     text,
  byte_size     bigint check (byte_size >= 0),
  duration_ms   int    check (duration_ms >= 0),
  page_count    int    check (page_count >= 0),
  language      text,
  checksum      text,

  captured_at   timestamptz,
  processed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint sources_has_payload check (
    storage_path is not null or external_url is not null or inline_text is not null
      or status in ('draft','uploading')
  )
);

create index if not exists sources_space_idx   on public.sources (space_id, created_at desc);
create index if not exists sources_user_idx    on public.sources (user_id, created_at desc);
create index if not exists sources_pending_idx on public.sources (status) where status in ('queued','processing');

-- ---------------------------------------------------------------------------
-- job_runs : per-stage observability so a failure is diagnosable and retryable
-- ---------------------------------------------------------------------------
create table if not exists public.job_runs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  source_id   uuid not null references public.sources(id) on delete cascade,
  stage       text not null,
  status      text not null default 'running' check (status in ('running','succeeded','failed')),
  attempt     int  not null default 1,
  provider    text,
  model       text,
  input_tokens  int,
  output_tokens int,
  error_code  text,
  error_detail text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists job_runs_source_idx on public.job_runs (source_id, started_at desc);

-- ---------------------------------------------------------------------------
-- transcripts + segments : timestamped, editable, and always source-linked
-- ---------------------------------------------------------------------------
create table if not exists public.transcripts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  source_id   uuid not null unique references public.sources(id) on delete cascade,
  language    text,
  provider    text,
  model       text,
  full_text   text not null default '',
  word_count  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.transcript_segments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  transcript_id uuid not null references public.transcripts(id) on delete cascade,
  idx           int  not null,
  start_ms      int  not null default 0 check (start_ms >= 0),
  end_ms        int  not null default 0 check (end_ms >= 0),
  speaker       text,
  text          text not null,
  -- User edits never destroy the machine output; we keep both.
  original_text text,
  edited_at     timestamptz,
  unique (transcript_id, idx)
);

create index if not exists transcript_segments_lookup_idx
  on public.transcript_segments (transcript_id, start_ms);
create index if not exists transcript_segments_search_idx
  on public.transcript_segments using gin (text extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- document_pages : structure-aware PDF/doc extraction.
-- Competitors flatten PDFs to raw text and lose diagrams. We keep the layout
-- relationships so a figure stays attached to what it illustrates.
-- ---------------------------------------------------------------------------
create table if not exists public.document_pages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  source_id   uuid not null references public.sources(id) on delete cascade,
  page_number int  not null check (page_number >= 1),
  text        text not null default '',
  -- [{level, text}] in reading order
  headings    jsonb not null default '[]'::jsonb,
  -- [{caption, rows:[[cell,...]]}]
  tables      jsonb not null default '[]'::jsonb,
  -- [{storage_path, caption, alt, bbox:[x,y,w,h]}]
  figures     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  unique (source_id, page_number)
);

create index if not exists document_pages_search_idx
  on public.document_pages using gin (text extensions.gin_trgm_ops);
