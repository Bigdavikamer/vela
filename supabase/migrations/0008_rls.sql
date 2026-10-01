-- Vela :: 0008 :: row level security
-- Default posture: a row is visible only to the user whose id is on it.
-- Tables that deviate are listed explicitly below with the reason.

-- ---------------------------------------------------------------------------
-- Standard owner-only tables: full CRUD for the owner, nothing for anyone else.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'user_preferences','study_spaces','sources','job_runs','transcripts',
    'transcript_segments','document_pages','notes','note_blocks','concepts',
    'concept_links','concept_mentions','derivations','decks','flashcards',
    'card_states','review_events','quiz_sets','quiz_questions','quiz_attempts',
    'quiz_responses','exams','exam_topics','study_plan_items','study_sessions',
    'chat_threads','chat_messages','content_chunks','share_links',
    'push_tokens','feedback_reports'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists owner_select on public.%I', t);
    execute format('drop policy if exists owner_insert on public.%I', t);
    execute format('drop policy if exists owner_update on public.%I', t);
    execute format('drop policy if exists owner_delete on public.%I', t);

    execute format(
      'create policy owner_select on public.%I for select to authenticated
         using ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy owner_insert on public.%I for insert to authenticated
         with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy owner_update on public.%I for update to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy owner_delete on public.%I for delete to authenticated
         using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles : keyed by id rather than user_id. No delete -- account removal
-- goes through delete_my_account() so it is all-or-nothing.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;

create policy profiles_select on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_insert on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy profiles_update on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- subscriptions : readable by the owner, writable only by the Stripe webhook
-- (service role bypasses RLS). A client can never grant itself a plan.
-- ---------------------------------------------------------------------------
alter table public.subscriptions enable row level security;
drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- usage_counters : readable by the owner; incremented only via increment_usage()
-- ---------------------------------------------------------------------------
alter table public.usage_counters enable row level security;
drop policy if exists usage_select on public.usage_counters;
create policy usage_select on public.usage_counters for select to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- analytics_events : write-only from the client. Nobody reads their own
-- analytics back, so there is no select policy.
-- ---------------------------------------------------------------------------
alter table public.analytics_events enable row level security;
drop policy if exists analytics_insert on public.analytics_events;
create policy analytics_insert on public.analytics_events for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- stripe_events : service role only. RLS on, zero policies = no client access.
-- ---------------------------------------------------------------------------
alter table public.stripe_events enable row level security;

-- ---------------------------------------------------------------------------
-- Public sharing.
--
-- Shared links are resolved through this function rather than an RLS policy, so
-- an anonymous viewer can read exactly one note and nothing around it -- not the
-- space, not sibling sources, not the owner identity.
-- ---------------------------------------------------------------------------
create or replace function public.get_shared_note(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_link  public.share_links;
  v_note  public.notes;
  v_blocks jsonb;
begin
  select * into v_link from public.share_links
   where token = p_token
     and revoked_at is null
     and (expires_at is null or expires_at > now())
     and resource_type = 'note';

  if v_link.id is null then
    return null;
  end if;

  select * into v_note from public.notes where id = v_link.resource_id;
  if v_note.id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'type', b.type, 'level', b.level,
           'term', b.term, 'content', b.content, 'origin', b.origin
         ) order by b.position), '[]'::jsonb)
    into v_blocks
  from public.note_blocks b where b.note_id = v_note.id;

  update public.share_links set view_count = view_count + 1 where id = v_link.id;

  return jsonb_build_object(
    'title', v_note.title,
    'summary', v_note.summary,
    'language', v_note.language,
    'updated_at', v_note.updated_at,
    'blocks', v_blocks
  );
end;
$$;

grant execute on function public.get_shared_note(text) to anon, authenticated;
