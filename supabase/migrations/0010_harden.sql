-- Vela :: 0010 :: hardening pass, driven by the Supabase security advisor
--
-- Three advisor findings are intentional and documented here rather than
-- "fixed" into something weaker:
--   * stripe_events has RLS on and zero policies -- that IS the access rule.
--     Only the service role (which bypasses RLS) may touch it.
--   * get_shared_note is SECURITY DEFINER and anon-executable by design; it is
--     the single, narrow door through which a public share link reads one note.
--   * delete_my_account is SECURITY DEFINER and authenticated-executable by
--     design; it deletes only auth.uid().
--
-- The rest are real and fixed below.

-- 1. Pin search_path on trigger functions. Without this, a role with a mutable
--    search_path could shadow a referenced object.
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.note_blocks_hash()
returns trigger language plpgsql set search_path = public, extensions, pg_temp as $$
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

create or replace function public.notes_mark_edited()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.is_user_edited then
    update public.notes set is_user_edited = true, updated_at = now()
    where id = new.note_id and is_user_edited = false;
  end if;
  return new;
end;
$$;

-- 2. Trigger functions must not be reachable as REST RPCs. Revoking EXECUTE
--    does not affect trigger firing, which runs in the table owner context.
revoke all on function public.handle_new_user()   from public, anon, authenticated;
revoke all on function public.set_updated_at()    from public, anon, authenticated;
revoke all on function public.note_blocks_hash()  from public, anon, authenticated;
revoke all on function public.notes_mark_edited() from public, anon, authenticated;

-- 3. Signed-in-only RPCs should not be callable by anon, even though each one
--    already rejects a null auth.uid(). Defence in depth.
revoke all on function public.increment_usage(text, numeric) from public, anon;
grant execute on function public.increment_usage(text, numeric) to authenticated;

revoke all on function public.recompute_concept_mastery(uuid) from public, anon;
grant execute on function public.recompute_concept_mastery(uuid) to authenticated;

revoke all on function public.search_content(text, extensions.vector, uuid, int) from public, anon;
grant execute on function public.search_content(text, extensions.vector, uuid, int) to authenticated;

revoke all on function public.due_cards(uuid, int) from public, anon;
grant execute on function public.due_cards(uuid, int) to authenticated;

revoke all on function public.due_counts() from public, anon;
grant execute on function public.due_counts() to authenticated;

comment on table public.stripe_events is
  'Stripe webhook ledger. RLS is enabled with no policies on purpose: only the service role may read or write it.';
