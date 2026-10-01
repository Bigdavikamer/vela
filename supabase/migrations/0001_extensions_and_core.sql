-- Vela :: 0001 :: extensions, core identity, and study spaces
-- Every user-owned table carries `user_id` so RLS can be a single, auditable rule.

create extension if not exists "pgcrypto"  with schema extensions;
create extension if not exists "vector"    with schema extensions;
create extension if not exists "pg_trgm"   with schema extensions;

-- ---------------------------------------------------------------------------
-- profiles : 1:1 with auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                      uuid primary key references auth.users(id) on delete cascade,
  display_name            text,
  avatar_path             text,
  -- UI language (BCP-47). Content language is chosen separately so we never
  -- silently translate a Portuguese lecture into English.
  ui_locale               text not null default 'en',
  -- null => "follow the source language"
  content_language        text,
  education_level         text check (education_level in
                            ('high_school','undergrad','postgrad','professional','self_directed','other')),
  study_style             text check (study_style in
                            ('recall_first','explain_first','practice_heavy','skim_then_drill')),
  timezone                text not null default 'UTC',
  onboarding_completed_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on column public.profiles.content_language is
  'Preferred language for AI-generated study material. NULL means: match the source material''s own language.';

-- ---------------------------------------------------------------------------
-- user_preferences : app behaviour, kept apart from identity
-- ---------------------------------------------------------------------------
create table if not exists public.user_preferences (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  theme                   text not null default 'system' check (theme in ('system','light','dark')),
  reduce_motion           boolean not null default false,
  haptics_enabled         boolean not null default true,
  font_scale              numeric(3,2) not null default 1.00 check (font_scale between 0.80 and 2.00),
  default_ambience        text not null default 'none',
  default_session_minutes int not null default 25 check (default_session_minutes between 5 and 180),
  notify_review_due       boolean not null default false,
  notify_exam_countdown   boolean not null default false,
  notify_processing_done  boolean not null default true,
  daily_review_hour       int check (daily_review_hour between 0 and 23),
  analytics_opt_out       boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- study_spaces : a subject / course. The unit the tutor reasons across.
-- ---------------------------------------------------------------------------
create table if not exists public.study_spaces (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null check (char_length(trim(name)) between 1 and 120),
  description    text,
  -- brand accent key, resolved to a real colour by the design system
  accent         text not null default 'candle' check (accent in
                   ('candle','ember','sage','tide','plum','slate','clay','moss')),
  icon           text,
  archived_at    timestamptz,
  last_opened_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists study_spaces_user_idx
  on public.study_spaces (user_id, archived_at, last_opened_at desc nulls last);
