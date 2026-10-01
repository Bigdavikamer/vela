-- Vela :: 0007 :: triggers, derived state, and RPCs
-- All SECURITY DEFINER functions pin search_path and filter by auth.uid().

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_preferences','study_spaces','sources','transcripts','notes',
    'note_blocks','concepts','decks','flashcards','exams','chat_threads','subscriptions'
  ] loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I; ' ||
      'create trigger set_updated_at before update on public.%I ' ||
      'for each row execute function public.set_updated_at()', t, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- note_blocks.content_hash -- the anchor for staleness detection
-- ---------------------------------------------------------------------------
create or replace function public.note_blocks_hash()
returns trigger
language plpgsql
as $$
begin
  new.content_hash := encode(extensions.digest(
    coalesce(new.term, '') || E'\n' || coalesce(new.content, ''), 'sha256'), 'hex');
  if tg_op = 'UPDATE'
     and (new.content is distinct from old.content or new.term is distinct from old.term) then
    new.is_user_edited := true;
  end if;
  return new;
end;
$$;

drop trigger if exists note_blocks_hash on public.note_blocks;
create trigger note_blocks_hash
  before insert or update of content, term on public.note_blocks
  for each row execute function public.note_blocks_hash();

-- keep the parent note flagged when any block is hand-edited
create or replace function public.notes_mark_edited()
returns trigger
language plpgsql
as $$
begin
  if new.is_user_edited then
    update public.notes set is_user_edited = true, updated_at = now()
    where id = new.note_id and is_user_edited = false;
  end if;
  return new;
end;
$$;

drop trigger if exists notes_mark_edited on public.note_blocks;
create trigger notes_mark_edited
  after update on public.note_blocks
  for each row execute function public.notes_mark_edited();

-- ---------------------------------------------------------------------------
-- new user bootstrap
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, ui_locale)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'display_name',
                         new.raw_user_meta_data->>'full_name', '')), ''),
    coalesce(nullif(new.raw_user_meta_data->>'ui_locale', ''), 'en')
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id) values (new.id)
  on conflict (user_id) do nothing;

  insert into public.subscriptions (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- staleness : which generated material no longer matches its source content
-- ---------------------------------------------------------------------------
create or replace view public.stale_derivations
with (security_invoker = true) as
select
  d.user_id,
  d.derived_type,
  d.derived_id,
  d.origin_type,
  d.origin_id
from public.derivations d
join public.note_blocks b
  on d.origin_type = 'note_block' and b.id = d.origin_id
where b.content_hash <> d.origin_hash;

comment on view public.stale_derivations is
  'Generated cards/questions whose source note block has changed since generation.';

-- ---------------------------------------------------------------------------
-- concept mastery : blended card recall and quiz accuracy, recency-weighted.
-- Deliberately simple and inspectable -- it drives what we show the student,
-- so it must be explainable.
-- ---------------------------------------------------------------------------
create or replace function public.recompute_concept_mastery(p_concept_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id  uuid;
  v_card     numeric;
  v_quiz     numeric;
  v_cardn    int;
  v_quizn    int;
  v_mastery  numeric;
begin
  select user_id into v_user_id from public.concepts where id = p_concept_id;
  if v_user_id is null or v_user_id <> auth.uid() then
    return null;
  end if;

  -- card side: share of "good"/"easy" grades over the last 20 reviews
  select count(*), avg(case when rating >= 3 then 1.0 else 0.0 end)
    into v_cardn, v_card
  from (
    select rating from public.review_events
    where concept_id = p_concept_id and user_id = v_user_id
    order by reviewed_at desc limit 20
  ) r;

  -- quiz side: share correct over the last 20 answers
  select count(*), avg(case when is_correct then 1.0 else 0.0 end)
    into v_quizn, v_quiz
  from (
    select is_correct from public.quiz_responses
    where concept_id = p_concept_id and user_id = v_user_id
    order by answered_at desc limit 20
  ) q;

  if coalesce(v_cardn, 0) + coalesce(v_quizn, 0) = 0 then
    return 0;
  end if;

  -- weight each side by how much evidence it has
  v_mastery := (coalesce(v_card, 0) * coalesce(v_cardn, 0)
              + coalesce(v_quiz, 0) * coalesce(v_quizn, 0))
             / nullif(coalesce(v_cardn, 0) + coalesce(v_quizn, 0), 0);

  -- confidence ramp: a single correct answer is not mastery
  v_mastery := v_mastery * least(1.0, (coalesce(v_cardn,0) + coalesce(v_quizn,0)) / 5.0);

  update public.concepts
     set mastery = round(greatest(0, least(1, v_mastery))::numeric, 3),
         mastery_updated_at = now()
   where id = p_concept_id;

  return v_mastery;
end;
$$;

-- ---------------------------------------------------------------------------
-- search : trigram + vector in one ranked list. Callers pass an embedding when
-- they have one; without it this degrades gracefully to lexical search.
-- ---------------------------------------------------------------------------
create or replace function public.search_content(
  p_query     text,
  p_embedding extensions.vector(384) default null,
  p_space_id  uuid default null,
  p_limit     int  default 30
)
returns table (
  chunk_id  uuid,
  space_id  uuid,
  source_id uuid,
  kind      text,
  ref_id    uuid,
  snippet   text,
  score     double precision
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    c.id,
    c.space_id,
    c.source_id,
    c.kind,
    c.ref_id,
    left(c.text, 320),
    -- lexical similarity, plus cosine similarity when an embedding is supplied
    (extensions.similarity(c.text, p_query) * 0.4)
      + (case when p_embedding is null then 0
              else (1 - (c.embedding operator(extensions.<=>) p_embedding)) * 0.6 end)
      as score
  from public.content_chunks c
  where c.user_id = (select auth.uid())
    and (p_space_id is null or c.space_id = p_space_id)
    and (
      p_embedding is not null
      or c.text ilike '%' || p_query || '%'
      or extensions.similarity(c.text, p_query) > 0.1
    )
  order by score desc
  limit greatest(1, least(p_limit, 100));
$$;

-- ---------------------------------------------------------------------------
-- review queue
-- ---------------------------------------------------------------------------
create or replace function public.due_cards(
  p_space_id uuid default null,
  p_limit    int  default 40
)
returns table (
  card_id     uuid,
  deck_id     uuid,
  space_id    uuid,
  concept_id  uuid,
  front       text,
  back        text,
  explanation text,
  tier        text,
  source_ref  jsonb,
  due         timestamptz,
  state       text,
  stability   double precision,
  difficulty  double precision,
  reps        int,
  lapses      int,
  last_review timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    f.id, f.deck_id, f.space_id, f.concept_id,
    f.front, f.back, f.explanation, f.tier, f.source_ref,
    s.due, s.state, s.stability, s.difficulty, s.reps, s.lapses, s.last_review
  from public.card_states s
  join public.flashcards f on f.id = s.card_id
  left join public.concepts c on c.id = f.concept_id
  where s.user_id = (select auth.uid())
    and not f.suspended
    and s.due <= now()
    and (p_space_id is null or f.space_id = p_space_id)
  -- weakest concepts first, then most overdue
  order by coalesce(c.mastery, 0) asc, s.due asc
  limit greatest(1, least(p_limit, 200));
$$;

create or replace function public.due_counts()
returns table (space_id uuid, space_name text, due_count bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select sp.id, sp.name, count(s.card_id)
  from public.study_spaces sp
  join public.flashcards f on f.space_id = sp.id and not f.suspended
  join public.card_states s on s.card_id = f.id and s.due <= now()
  where sp.user_id = (select auth.uid()) and sp.archived_at is null
  group by sp.id, sp.name
  having count(s.card_id) > 0
  order by count(s.card_id) desc;
$$;

-- ---------------------------------------------------------------------------
-- usage metering
-- ---------------------------------------------------------------------------
create or replace function public.increment_usage(p_field text, p_amount numeric default 1)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_start date := date_trunc('month', now())::date;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_field not in ('sources_processed','minutes_captured','tutor_messages','quizzes_generated') then
    raise exception 'unknown usage field: %', p_field;
  end if;

  insert into public.usage_counters (user_id, period_start) values (v_uid, v_start)
  on conflict (user_id, period_start) do nothing;

  execute format(
    'update public.usage_counters set %I = %I + $1, updated_at = now()
      where user_id = $2 and period_start = $3', p_field, p_field)
  using p_amount, v_uid, v_start;
end;
$$;

-- ---------------------------------------------------------------------------
-- account deletion : one call removes everything the student owns.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp, auth
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  -- every user-owned table cascades from auth.users
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
