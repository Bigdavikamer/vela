-- Vela :: 0011 :: enable Realtime on the tables the app subscribes to
--
-- `postgres_changes` only delivers events for tables in the `supabase_realtime`
-- publication. Without this, the capture screen subscribed to a channel that
-- could never fire: a source would move to `ready` or `failed` in the database
-- while the app sat on "Still working…" forever.
--
-- RLS still applies on top of the publication, so a student only ever receives
-- events for their own rows.

do $$
declare t text;
begin
  foreach t in array array['sources', 'notes', 'note_blocks'] loop
    -- add_table is not idempotent; adding twice raises.
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- Realtime sends only the primary key on UPDATE unless the table has a full
-- replica identity. The app reads status/stage/progress off the payload, so it
-- needs the whole row.
alter table public.sources replica identity full;
