-- Vela :: 0003 :: notes, concepts, and the derivation graph
-- This is the layer competitors skip. Notes are structured blocks (not one
-- markdown blob) so a single paragraph can be edited, re-generated, or cited
-- independently -- and so we can tell exactly which flashcards went stale.

-- ---------------------------------------------------------------------------
-- notes : a study guide. Usually 1:1 with a source, but a note may synthesize
-- an entire space (source_id null) -- e.g. "everything for the midterm".
-- ---------------------------------------------------------------------------
create table if not exists public.notes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  space_id       uuid not null references public.study_spaces(id) on delete cascade,
  source_id      uuid references public.sources(id) on delete cascade,
  title          text not null default 'Untitled',
  summary        text,
  language       text,
  kind           text not null default 'source' check (kind in ('source','synthesis')),
  generation     int  not null default 1,
  is_user_edited boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists notes_space_idx on public.notes (space_id, updated_at desc);
create unique index if not exists notes_one_per_source_idx
  on public.notes (source_id) where source_id is not null and kind = 'source';

-- ---------------------------------------------------------------------------
-- note_blocks : the structured body
-- ---------------------------------------------------------------------------
create table if not exists public.note_blocks (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users(id) on delete cascade,
  note_id  uuid not null references public.notes(id) on delete cascade,
  -- fractional so a block can be inserted between two others without a rewrite
  position numeric not null,
  type     text not null check (type in
             ('heading','paragraph','bullet','numbered','definition','example',
              'callout','key_fact','formula','quote','summary','figure')),
  level    int check (level between 1 and 4),
  -- for `definition` blocks: the term being defined
  term     text,
  content  text not null default '',
  meta     jsonb not null default '{}'::jsonb,

  -- Where this came from. {segment_ids:[uuid], page:int, source_id:uuid}
  source_ref jsonb not null default '{}'::jsonb,

  -- Provenance of the text itself, so the UI can label what the student is
  -- reading: extracted from the source, written by the AI, or typed by them.
  origin   text not null default 'ai' check (origin in ('source','ai','user')),

  content_hash   text not null default '',
  is_user_edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists note_blocks_note_idx on public.note_blocks (note_id, position);
create index if not exists note_blocks_search_idx
  on public.note_blocks using gin (content extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- concepts : the unit of learning. Mastery is tracked here, not per-card, so
-- "what do I actually not understand" has one honest answer.
-- ---------------------------------------------------------------------------
create table if not exists public.concepts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  space_id           uuid not null references public.study_spaces(id) on delete cascade,
  name               text not null,
  -- lowercased/trimmed for dedup across sources within a space
  normalized_name    text not null,
  definition         text,
  importance         int not null default 3 check (importance between 1 and 5),
  -- 0..1, recomputed from review + quiz performance
  mastery            numeric(4,3) not null default 0 check (mastery between 0 and 1),
  mastery_updated_at timestamptz,
  first_source_id    uuid references public.sources(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (space_id, normalized_name)
);

create index if not exists concepts_space_idx on public.concepts (space_id, importance desc);
create index if not exists concepts_weak_idx  on public.concepts (user_id, mastery)
  where mastery < 0.6;

-- relationships power the concept map and prerequisite-aware review order
create table if not exists public.concept_links (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  from_concept uuid not null references public.concepts(id) on delete cascade,
  to_concept   uuid not null references public.concepts(id) on delete cascade,
  relation     text not null default 'related' check (relation in
                 ('related','prerequisite_of','part_of','causes','contrasts_with','example_of')),
  weight       numeric(3,2) not null default 0.50 check (weight between 0 and 1),
  created_at   timestamptz not null default now(),
  unique (from_concept, to_concept, relation),
  constraint concept_links_no_self check (from_concept <> to_concept)
);

create index if not exists concept_links_from_idx on public.concept_links (from_concept);
create index if not exists concept_links_to_idx   on public.concept_links (to_concept);

-- where a concept is discussed -- makes every concept traceable to material
create table if not exists public.concept_mentions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  concept_id    uuid not null references public.concepts(id) on delete cascade,
  source_id     uuid references public.sources(id) on delete cascade,
  note_block_id uuid references public.note_blocks(id) on delete cascade,
  created_at    timestamptz not null default now()
);

create index if not exists concept_mentions_concept_idx on public.concept_mentions (concept_id);
create index if not exists concept_mentions_block_idx   on public.concept_mentions (note_block_id);

-- ---------------------------------------------------------------------------
-- derivations : the answer to "my note changed, what is now out of date?"
-- Every generated artifact records which content it was built from and that
-- content hash at generation time. Staleness is then a cheap join, not a
-- guess -- and we never silently discard the student edits.
-- ---------------------------------------------------------------------------
create table if not exists public.derivations (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  derived_type text not null check (derived_type in ('flashcard','quiz_question','note_block')),
  derived_id   uuid not null,
  origin_type  text not null check (origin_type in ('note_block','transcript_segment','document_page')),
  origin_id    uuid not null,
  origin_hash  text not null,
  created_at   timestamptz not null default now(),
  unique (derived_type, derived_id, origin_type, origin_id)
);

create index if not exists derivations_origin_idx  on public.derivations (origin_type, origin_id);
create index if not exists derivations_derived_idx on public.derivations (derived_type, derived_id);
