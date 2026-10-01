-- Vela :: 0009 :: storage buckets
-- Lecture recordings are among the most sensitive things a student owns.
-- Every bucket here is private; the app reads through short-lived signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- raw uploads: recordings, audio/video files, PDFs, documents, images
  ('sources', 'sources', false, 524288000, null),
  -- figures and diagrams extracted from documents during processing
  ('derived', 'derived', false, 26214400,
     array['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('avatars', 'avatars', false, 5242880,
     array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Object paths are always `{user_id}/...`, so ownership is the first segment.
-- ---------------------------------------------------------------------------
do $$
declare b text;
begin
  foreach b in array array['sources','derived','avatars'] loop
    execute format('drop policy if exists %I on storage.objects', b || '_read');
    execute format('drop policy if exists %I on storage.objects', b || '_insert');
    execute format('drop policy if exists %I on storage.objects', b || '_update');
    execute format('drop policy if exists %I on storage.objects', b || '_delete');

    execute format($p$
      create policy %I on storage.objects for select to authenticated
        using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$, b || '_read', b);

    execute format($p$
      create policy %I on storage.objects for insert to authenticated
        with check (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$, b || '_insert', b);

    execute format($p$
      create policy %I on storage.objects for update to authenticated
        using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)
        with check (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$, b || '_update', b, b);

    execute format($p$
      create policy %I on storage.objects for delete to authenticated
        using (bucket_id = %L and (storage.foldername(name))[1] = (select auth.uid())::text)
    $p$, b || '_delete', b);
  end loop;
end;
$$;
