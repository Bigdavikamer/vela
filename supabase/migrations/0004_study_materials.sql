-- Vela :: 0004 :: flashcards, scheduling state, and quizzes
-- Cards are attached to concepts, not to arbitrary sentences. Scheduling state
-- is a separate hot table from card content so review writes never contend
-- with content edits.

-- ---------------------------------------------------------------------------
-- decks
-- ---------------------------------------------------------------------------
create table if not exists public.decks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  space_id   uuid not null references public.study_spaces(id) on delete cascade,
  source_id  uuid references public.sources(id) on delete set null,
  title      text not null default 'Flashcards',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists decks_space_idx on public.decks (space_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- flashcards
-- ---------------------------------------------------------------------------
create table if not exists public.flashcards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  deck_id    uuid not null references public.decks(id) on delete cascade,
  space_id   uuid not null references public.study_spaces(id) on delete cascade,
  concept_id uuid references public.concepts(id) on delete set null,

  front       text not null,
  back        text not null,
  -- the "why", shown after grading -- a wrong answer should teach something
  explanation text,

  -- tier, not difficulty-as-guessed: intro = recall, core = understanding,
  -- advanced = application. Generation targets a mix.
  tier      text not null default 'core' check (tier in ('intro','core','advanced')),

  source_ref jsonb not null default '{}'::jsonb,
  generation int not null default 1,
  is_user_edited boolean not null default false,
  suspended  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists flashcards_deck_idx    on public.flashcards (deck_id);
create index if not exists flashcards_concept_idx on public.flashcards (concept_id);
create index if not exists flashcards_space_idx   on public.flashcards (space_id) where not suspended;

-- ---------------------------------------------------------------------------
-- card_states : FSRS-6 memory model, one row per card
-- ---------------------------------------------------------------------------
create table if not exists public.card_states (
  card_id        uuid primary key references public.flashcards(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  due            timestamptz not null default now(),
  stability      double precision not null default 0,
  difficulty     double precision not null default 0,
  elapsed_days   double precision not null default 0,
  scheduled_days double precision not null default 0,
  learning_steps int not null default 0,
  reps           int not null default 0,
  lapses         int not null default 0,
  state          text not null default 'new' check (state in ('new','learning','review','relearning')),
  last_review    timestamptz,
  updated_at     timestamptz not null default now()
);

-- the query that runs every time a student opens review
create index if not exists card_states_due_idx on public.card_states (user_id, due);

-- ---------------------------------------------------------------------------
-- review_events : append-only log. Enables honest analytics and, later,
-- per-user FSRS parameter optimisation.
-- ---------------------------------------------------------------------------
create table if not exists public.review_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  card_id        uuid not null references public.flashcards(id) on delete cascade,
  concept_id     uuid references public.concepts(id) on delete set null,
  session_id     uuid,
  rating         int not null check (rating between 1 and 4), -- again/hard/good/easy
  state_before   text,
  stability_before  double precision,
  difficulty_before double precision,
  elapsed_days   double precision,
  scheduled_days double precision,
  duration_ms    int,
  reviewed_at    timestamptz not null default now()
);

create index if not exists review_events_user_idx    on public.review_events (user_id, reviewed_at desc);
create index if not exists review_events_concept_idx on public.review_events (concept_id, reviewed_at desc);

-- ---------------------------------------------------------------------------
-- quizzes : no arbitrary length cap. Mode drives generation strategy.
-- ---------------------------------------------------------------------------
create table if not exists public.quiz_sets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  space_id   uuid not null references public.study_spaces(id) on delete cascade,
  source_id  uuid references public.sources(id) on delete set null,
  exam_id    uuid,
  title      text not null default 'Quiz',
  mode       text not null default 'standard' check (mode in
               ('quick','standard','long','weak_areas','exam_sim','custom')),
  question_count int not null default 10 check (question_count between 1 and 100),
  config     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists quiz_sets_space_idx on public.quiz_sets (space_id, created_at desc);

create table if not exists public.quiz_questions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  quiz_set_id uuid not null references public.quiz_sets(id) on delete cascade,
  space_id    uuid not null references public.study_spaces(id) on delete cascade,
  concept_id  uuid references public.concepts(id) on delete set null,
  idx         int  not null,
  type        text not null check (type in ('multiple_choice','true_false','short_answer','matching')),
  prompt      text not null,
  -- multiple_choice: ["a","b",...]  matching: {left:[],right:[]}
  options     jsonb not null default '[]'::jsonb,
  -- index for MC, boolean for TF, accepted strings for short answer, pairs for matching
  answer      jsonb not null,
  explanation text,
  tier        text not null default 'core' check (tier in ('intro','core','advanced')),
  source_ref  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (quiz_set_id, idx)
);

create index if not exists quiz_questions_set_idx on public.quiz_questions (quiz_set_id, idx);

create table if not exists public.quiz_attempts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  quiz_set_id   uuid not null references public.quiz_sets(id) on delete cascade,
  session_id    uuid,
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  total         int not null default 0,
  correct       int not null default 0,
  score         numeric(5,4) check (score between 0 and 1)
);

create index if not exists quiz_attempts_user_idx on public.quiz_attempts (user_id, started_at desc);

create table if not exists public.quiz_responses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  attempt_id  uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  concept_id  uuid references public.concepts(id) on delete set null,
  response    jsonb,
  is_correct  boolean not null default false,
  -- short answers are graded by the model; keep its reasoning for the review screen
  grader_note text,
  duration_ms int,
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index if not exists quiz_responses_attempt_idx on public.quiz_responses (attempt_id);
create index if not exists quiz_responses_concept_idx on public.quiz_responses (concept_id, answered_at desc);
