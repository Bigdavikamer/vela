import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import { useEffect } from 'react';

import { api } from '../lib/api';
import { qk } from '../lib/queryClient';
import { supabase, unwrap, VelaError } from '../lib/supabase';
import { useUserId } from '../stores/auth';

/**
 * Capture: getting material into Vela and through the pipeline.
 *
 * The rule that shapes this file: never lose the student's material. A source
 * row is created and the file uploaded BEFORE processing is triggered, so a
 * crash, a dead battery, or a failed AI call always leaves something to retry
 * rather than nothing to recover.
 */

export type SourceKind =
  | 'recording' | 'audio' | 'video' | 'pdf' | 'document' | 'text' | 'url' | 'youtube' | 'image';

export type SourceStatus =
  | 'draft' | 'uploading' | 'queued' | 'processing' | 'ready' | 'failed' | 'canceled';

export type SourceStage =
  | 'upload' | 'extract' | 'transcribe' | 'structure' | 'concepts' | 'materials' | 'done';

export type Source = {
  id: string;
  space_id: string;
  kind: SourceKind;
  title: string;
  status: SourceStatus;
  stage: SourceStage | null;
  progress: number;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  storage_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  byte_size: number | null;
  duration_ms: number | null;
  page_count: number | null;
  language: string | null;
  created_at: string;
  processed_at: string | null;
};

/** True while the pipeline still owes this source a terminal status. */
function isInFlight(source: Source | undefined): boolean {
  if (!source) return false;
  return source.status === 'uploading' || source.status === 'queued' || source.status === 'processing';
}

/** Anything above this is refused up front rather than failing after a long upload. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/* -------------------------------------------------------------------------- */
/* Queries                                                                    */
/* -------------------------------------------------------------------------- */

export function useSources(spaceId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: qk.sources(spaceId ?? ''),
    enabled: Boolean(spaceId),
    // Realtime is the fast path; this is the guarantee. If the socket drops or
    // the publication is misconfigured, progress still resolves.
    refetchInterval: (q) => ((q.state.data ?? []).some(isInFlight) ? 4000 : false),
    queryFn: async (): Promise<Source[]> =>
      unwrap(
        await supabase
          .from('sources')
          .select('*')
          .eq('space_id', spaceId!)
          .order('created_at', { ascending: false }),
      ) as Source[],
  });

  // Processing takes minutes. Realtime means the student watches it advance
  // instead of pulling to refresh and wondering whether it is stuck.
  useEffect(() => {
    if (!spaceId) return;
    const channel = supabase
      .channel(`sources:${spaceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sources', filter: `space_id=eq.${spaceId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: qk.sources(spaceId) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [spaceId, queryClient]);

  return query;
}

export function useSource(sourceId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: qk.source(sourceId ?? ''),
    enabled: Boolean(sourceId),
    // The processing screen must reach a terminal state on its own. Relying on
    // Realtime alone left it showing "Still working…" after the job had already
    // failed in the database.
    refetchInterval: (q) => (isInFlight(q.state.data) ? 3000 : false),
    queryFn: async (): Promise<Source> =>
      unwrap(await supabase.from('sources').select('*').eq('id', sourceId!).single()) as Source,
  });

  useEffect(() => {
    if (!sourceId) return;
    const channel = supabase
      .channel(`source:${sourceId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sources', filter: `id=eq.${sourceId}` },
        (payload) => {
          queryClient.setQueryData(qk.source(sourceId), payload.new as Source);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sourceId, queryClient]);

  return query;
}

/** Anything still running, across every space — drives the Home banner. */
export function useActiveSources() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['sources', 'active'],
    enabled: Boolean(userId),
    refetchInterval: (q) => ((q.state.data ?? []).some(isInFlight) ? 4000 : false),
    queryFn: async (): Promise<Source[]> =>
      unwrap(
        await supabase
          .from('sources')
          .select('*')
          .in('status', ['uploading', 'queued', 'processing'])
          .order('created_at', { ascending: false }),
      ) as Source[],
  });
}

/* -------------------------------------------------------------------------- */
/* Creating material                                                          */
/* -------------------------------------------------------------------------- */

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new VelaError('Sign in to continue.', 'unauthenticated', false);
  return data.user.id;
}

export type CreateTextInput = { spaceId: string; title: string; text: string };

export function useCreateTextSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ spaceId, title, text }: CreateTextInput): Promise<Source> => {
      const userId = await currentUserId();
      const source = unwrap(
        await supabase
          .from('sources')
          .insert({
            user_id: userId,
            space_id: spaceId,
            kind: 'text',
            title: title.trim() || 'Pasted text',
            inline_text: text,
            status: 'queued',
            captured_at: new Date().toISOString(),
          })
          .select('*')
          .single(),
      ) as Source;

      await api.processSource(source.id);
      return source;
    },
    onSuccess: (source) => invalidateSource(queryClient, source.space_id),
  });
}

export type CreateUrlInput = { spaceId: string; title?: string; url: string };

export function useCreateUrlSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ spaceId, title, url }: CreateUrlInput): Promise<Source> => {
      const userId = await currentUserId();
      const trimmed = url.trim();
      const isYoutube = /(?:youtube\.com|youtu\.be)/i.test(trimmed);

      const source = unwrap(
        await supabase
          .from('sources')
          .insert({
            user_id: userId,
            space_id: spaceId,
            kind: isYoutube ? 'youtube' : 'url',
            title: title?.trim() || hostnameOf(trimmed),
            external_url: trimmed,
            status: 'queued',
            captured_at: new Date().toISOString(),
          })
          .select('*')
          .single(),
      ) as Source;

      await api.processSource(source.id);
      return source;
    },
    onSuccess: (source) => invalidateSource(queryClient, source.space_id),
  });
}

export type UploadInput = {
  spaceId: string;
  uri: string;
  title: string;
  kind: SourceKind;
  mimeType: string;
  byteSize?: number;
  durationMs?: number;
  onProgress?: (fraction: number) => void;
};

/**
 * Uploads a local file and queues it for processing.
 *
 * The order is deliberate: create the row as `uploading`, push the bytes, then
 * flip to `queued` and trigger the pipeline. If the upload dies halfway, the
 * row survives in `uploading` with the local file still on the device, and the
 * retry path can finish the job.
 */
export function useUploadSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UploadInput): Promise<Source> => {
      const userId = await currentUserId();
      const file = new File(input.uri);

      if (!file.exists) {
        throw new VelaError('That file is no longer on this device.', 'not_found', false);
      }

      const size = input.byteSize ?? file.size ?? 0;
      if (size > MAX_UPLOAD_BYTES) {
        throw new VelaError(
          `That file is ${formatBytes(size)}. Vela can process up to ${formatBytes(MAX_UPLOAD_BYTES)}.`,
          'unknown',
          false,
        );
      }

      const extension = file.extension || guessExtension(input.mimeType);
      const source = unwrap(
        await supabase
          .from('sources')
          .insert({
            user_id: userId,
            space_id: input.spaceId,
            kind: input.kind,
            title: input.title.trim() || 'Untitled',
            status: 'uploading',
            stage: 'upload',
            mime_type: input.mimeType,
            byte_size: size,
            duration_ms: input.durationMs ?? null,
            captured_at: new Date().toISOString(),
          })
          .select('*')
          .single(),
      ) as Source;

      const path = `${userId}/${source.id}/original${extension}`;

      try {
        input.onProgress?.(0.05);
        const bytes = await file.bytes();
        input.onProgress?.(0.35);

        const { error: uploadError } = await supabase.storage
          .from('sources')
          .upload(path, bytes, { contentType: input.mimeType, upsert: true });

        if (uploadError) throw uploadError;
        input.onProgress?.(0.9);

        const updated = unwrap(
          await supabase
            .from('sources')
            .update({ storage_path: path, status: 'queued', progress: 5 })
            .eq('id', source.id)
            .select('*')
            .single(),
        ) as Source;

        await api.processSource(source.id);
        input.onProgress?.(1);
        return updated;
      } catch (error) {
        // Leave the row behind, marked, so the student can retry instead of
        // re-recording a lecture that no longer exists.
        await supabase
          .from('sources')
          .update({
            status: 'failed',
            error_code: 'upload_failed',
            error_message: 'The upload did not finish. Your file is still on this device.',
          })
          .eq('id', source.id);
        throw error;
      }
    },
    onSuccess: (source) => invalidateSource(queryClient, source.space_id),
  });
}

/* -------------------------------------------------------------------------- */
/* Recovery                                                                   */
/* -------------------------------------------------------------------------- */

export function useRetrySource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (source: Source) => {
      await supabase
        .from('sources')
        .update({ status: 'queued', error_code: null, error_message: null, progress: 5 })
        .eq('id', source.id);
      await api.processSource(source.id);
    },
    onSuccess: (_data, source) => {
      invalidateSource(queryClient, source.space_id);
      void queryClient.invalidateQueries({ queryKey: qk.source(source.id) });
    },
  });
}

export function useDeleteSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (source: Source) => {
      // Remove the stored file first: an orphaned row is recoverable, an
      // orphaned private recording in storage is a privacy problem.
      if (source.storage_path) {
        await supabase.storage.from('sources').remove([source.storage_path]);
      }
      const { error } = await supabase.from('sources').delete().eq('id', source.id);
      if (error) throw error;
    },
    onSuccess: (_data, source) => invalidateSource(queryClient, source.space_id),
  });
}

/** A short-lived signed URL for playback. Never a public link. */
export async function getPlaybackUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('sources')
    .createSignedUrl(storagePath, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

/* -------------------------------------------------------------------------- */

function invalidateSource(
  queryClient: ReturnType<typeof useQueryClient>,
  spaceId: string,
) {
  void queryClient.invalidateQueries({ queryKey: qk.sources(spaceId) });
  void queryClient.invalidateQueries({ queryKey: qk.spaces() });
  void queryClient.invalidateQueries({ queryKey: ['sources', 'active'] });
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Link';
  }
}

function guessExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'application/pdf': '.pdf',
    'audio/m4a': '.m4a',
    'audio/mp4': '.m4a',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'text/plain': '.txt',
    'text/markdown': '.md',
  };
  return map[mimeType] ?? '';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Human label for a source kind, used in lists and empty states. */
export function kindLabel(kind: SourceKind): string {
  switch (kind) {
    case 'recording': return 'Recording';
    case 'audio': return 'Audio';
    case 'video': return 'Video';
    case 'pdf': return 'PDF';
    case 'document': return 'Document';
    case 'text': return 'Text';
    case 'url': return 'Link';
    case 'youtube': return 'Video link';
    case 'image': return 'Image';
  }
}

export function kindIcon(kind: SourceKind) {
  switch (kind) {
    case 'recording': return 'mic' as const;
    case 'audio': return 'headphones' as const;
    case 'video': return 'video' as const;
    case 'pdf':
    case 'document': return 'file-text' as const;
    case 'text': return 'type' as const;
    case 'url':
    case 'youtube': return 'link' as const;
    case 'image': return 'image' as const;
  }
}
