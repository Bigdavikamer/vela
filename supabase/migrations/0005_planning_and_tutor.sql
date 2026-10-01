-- Vela :: 0005 :: exams, study plans, sessions, and the tutor
-- Planning is advisory and labelled as such: we schedule review, we do not
-- predict grades.

-- ---------------------------------------------------------------------------
-- exams
-- ---------------------------------------------------------------------------
create table if not exists public.exams (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  space_id   uuid not null references public.study_spaces(id) on delete cascade,
  title      text not null,
  exam_date  date not null,
  notes      text,
  status     text not null default 'active' check (status in ('active','done','archived')),
  -- 0..1 readiness, recomputed from concept mastery across the exam scope
  readiness  numeric(4,3) not null default 0 check (readiness between 0 and 1),
  readiness_updated_at timestamptz,
  plan_generated_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exams_user_idx on public.exams (user_id, exam_date) where status = 'active';

-- which concepts are in scope, and how heavily they are weighted
create table if not exists public.exam_topics (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  exam_id    uuid not null references public.exams(id) on delete cascade,
  concept_id uuid references public.concepts(id) on delete cascade,
  title      text not null,
  priority   int not null default 3 check (priority between 1 and 5),
  created_at timestamptz not null default now(),
  unique (exam_id, concept_id)
);

create index if not exists exam_topics_exam_idx on public.exam_topics (exam_id, priority desc);

-- the generated plan: dated, concrete, checkable work
create table if not exists public.study_plan_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  exam_id      uuid not null references public.exams(id) on delete cascade,
  scheduled_for date not null,
  kind         text not null check (kind in ('review','flashcards','quiz','read','drill')),
  title        text not null,
  -- {concept_ids:[], deck_id:, quiz_set_id:, note_id:}
  target       jsonb not null default '{}'::jsonb,
  estimated_minutes int not null default 15 check (estimated_minutes between 1 and 240),
  priority     int not null default 3 check (priority between 1 and 5),
  completed_at timestamptz,
  skipped_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists study_plan_items_due_idx
  on public.study_plan_items (user_id, scheduled_for) where completed_at is null;

-- ---------------------------------------------------------------------------
-- study_sessions : a bounded stretch of focused work
-- ---------------------------------------------------------------------------
create table if not exists public.study_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  space_id      uuid references public.study_spaces(id) on delete set null,
  exam_id       uuid references public.exams(id) on delete set null,
  mode          text not null default 'focus' check (mode in
                  ('focus','deep','quick_review','exam_prep')),
  goal          text,
  ambience      text not null default 'none',
  planned_minutes int not null default 25 check (planned_minutes between 1 and 240),
  -- actual focused seconds, excluding breaks
  focused_seconds int not null default 0 check (focused_seconds >= 0),
  break_seconds   int not null default 0 check (break_seconds >= 0),
  cards_reviewed  int not null default 0,
  questions_answered int not null default 0,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  completed     boolean not null default false
);

create index if not exists study_sessions_user_idx on public.study_sessions (user_id, started_at desc);

-- ---------------------------------------------------------------------------
-- tutor : threads are space-scoped by default, so the tutor can reason across
-- every source in a subject rather than one recording at a time.
-- ---------------------------------------------------------------------------
create table if not exists public.chat_threads (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  space_id   uuid not null references public.study_spaces(id) on delete cascade,
  -- optional narrowing to a single source
  source_id  uuid references public.sources(id) on delete cascade,
  title      text not null default 'New conversation',
  mode       text not null default 'explain' check (mode in
               ('explain','learn','quiz_me','test_me','find_gaps','summarize','deep_dive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_threads_space_idx on public.chat_threads (space_id, updated_at desc);

create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  thread_id  uuid not null references public.chat_threads(id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  -- [{source_id, note_block_id, segment_id, page, quote, label}] -- every claim
  -- the tutor makes about the material should be traceable back to it
  citations  jsonb not null default '[]'::jsonb,
  -- set when the model declined to answer for lack of grounding
  ungrounded boolean not null default false,
  input_tokens  int,
  output_tokens int,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_thread_idx on public.chat_messages (thread_id, created_at);
