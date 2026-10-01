import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';

import { api } from '../lib/api';
import { qk } from '../lib/queryClient';
import { supabase, unwrap } from '../lib/supabase';

/**
 * Notes and transcripts.
 *
 * Notes are stored as ordered blocks rather than one markdown blob, which is
 * what makes three things possible that a blob cannot do: edit one paragraph
 * without touching the rest, cite each block back to its source, and know
 * exactly which flashcards a given edit invalidated.
 */

export type NoteBlockType =
  | 'heading' | 'paragraph' | 'bullet' | 'numbered' | 'definition'
  | 'example' | 'callout' | 'key_fact' | 'formula' | 'quote' | 'summary' | 'figure';

export type NoteBlock = {
  id: string;
  note_id: string;
  position: number;
  type: NoteBlockType;
  level: number | null;
  term: string | null;
  content: string;
  origin: 'source' | 'ai' | 'user';
  source_ref: { segment_ids?: string[]; page?: number | null; source_id?: string };
  is_user_edited: boolean;
};

export type Note = {
  id: string;
  space_id: string;
  source_id: string | null;
  title: string;
  summary: string | null;
  language: string | null;
  kind: 'source' | 'synthesis';
  is_user_edited: boolean;
  updated_at: string;
};

export type TranscriptSegment = {
  id: string;
  idx: number;
  start_ms: number;
  end_ms: number;
  speaker: string | null;
  text: string;
  original_text: string | null;
  edited_at: string | null;
};

/* -------------------------------------------------------------------------- */
/* Notes                                                                      */
/* -------------------------------------------------------------------------- */

export function useNoteForSource(sourceId: string | undefined) {
  return useQuery({
    queryKey: qk.note(sourceId ?? ''),
    enabled: Boolean(sourceId),
    queryFn: async (): Promise<{ note: Note; blocks: NoteBlock[] } | null> => {
      const note = unwrap(
        await supabase
          .from('notes')
          .select('*')
          .eq('source_id', sourceId!)
          .eq('kind', 'source')
          .maybeSingle(),
      ) as Note | null;

      if (!note) return null;

      const blocks = unwrap(
        await supabase
          .from('note_blocks')
          .select('*')
          .eq('note_id', note.id)
          .order('position', { ascending: true }),
      ) as NoteBlock[];

      return { note, blocks };
    },
  });
}

export function useUpdateNoteBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { blockId: string; content: string; term?: string | null }) => {
      // The database trigger recomputes content_hash and flags is_user_edited,
      // which is what makes derived cards show as stale.
      return unwrap(
        await supabase
          .from('note_blocks')
          .update({ content: input.content, term: input.term ?? null })
          .eq('id', input.blockId)
          .select('*')
          .single(),
      ) as NoteBlock;
    },
    onSuccess: (block) => {
      void queryClient.invalidateQueries({ queryKey: ['note'] });
      void queryClient.invalidateQueries({ queryKey: qk.noteStale(block.note_id) });
    },
  });
}

export function useDeleteNoteBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (blockId: string) => {
      const { error } = await supabase.from('note_blocks').delete().eq('id', blockId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['note'] });
    },
  });
}

/** Asks the server to rewrite one block. Not a hand edit, so nothing goes stale. */
export function useRewriteBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { blockId: string; instruction?: string }) => api.rewriteBlock(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['note'] });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Staleness                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * How much derived material is out of date because the note was edited.
 * This is the check that stops a student revising from cards they have already
 * corrected.
 */
export function useStaleCount(noteId: string | undefined) {
  return useQuery({
    queryKey: qk.noteStale(noteId ?? ''),
    enabled: Boolean(noteId),
    staleTime: 0,
    queryFn: () => api.staleCheck(noteId!),
  });
}

export function useRefreshStale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) => api.refreshStale(noteId),
    onSuccess: (_result, noteId) => {
      void queryClient.invalidateQueries({ queryKey: qk.noteStale(noteId) });
      void queryClient.invalidateQueries({ queryKey: ['dueCards'] });
      void queryClient.invalidateQueries({ queryKey: qk.dueCounts() });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Transcript                                                                 */
/* -------------------------------------------------------------------------- */

export function useTranscript(sourceId: string | undefined) {
  return useQuery({
    queryKey: qk.transcript(sourceId ?? ''),
    enabled: Boolean(sourceId),
    queryFn: async (): Promise<{ id: string; language: string | null; segments: TranscriptSegment[] } | null> => {
      const transcript = unwrap(
        await supabase
          .from('transcripts')
          .select('id, language')
          .eq('source_id', sourceId!)
          .maybeSingle(),
      ) as { id: string; language: string | null } | null;

      if (!transcript) return null;

      const segments = unwrap(
        await supabase
          .from('transcript_segments')
          .select('*')
          .eq('transcript_id', transcript.id)
          .order('idx', { ascending: true }),
      ) as TranscriptSegment[];

      return { ...transcript, segments };
    },
  });
}

/** Editing a segment keeps the machine original so nothing is destroyed. */
export function useEditSegment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { segment: TranscriptSegment; text: string }) => {
      return unwrap(
        await supabase
          .from('transcript_segments')
          .update({
            text: input.text,
            original_text: input.segment.original_text ?? input.segment.text,
            edited_at: new Date().toISOString(),
          })
          .eq('id', input.segment.id)
          .select('*')
          .single(),
      ) as TranscriptSegment;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transcript'] });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Sharing                                                                    */
/* -------------------------------------------------------------------------- */

export type ShareLink = {
  id: string;
  token: string;
  revoked_at: string | null;
  view_count: number;
};

export function useShareLink(noteId: string | undefined) {
  return useQuery({
    queryKey: ['share', noteId ?? ''],
    enabled: Boolean(noteId),
    queryFn: async (): Promise<ShareLink | null> =>
      unwrap(
        await supabase
          .from('share_links')
          .select('id, token, revoked_at, view_count')
          .eq('resource_type', 'note')
          .eq('resource_id', noteId!)
          .is('revoked_at', null)
          .maybeSingle(),
      ) as ShareLink | null,
  });
}

export function useCreateShareLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (noteId: string): Promise<ShareLink> => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not signed in');

      // 192 bits of entropy: a share token is the only thing standing between a
      // private note and the internet, so it must not be guessable.
      const token = Crypto.randomUUID().replace(/-/g, '') + Crypto.randomUUID().replace(/-/g, '').slice(0, 16);

      return unwrap(
        await supabase
          .from('share_links')
          .insert({
            user_id: userData.user.id,
            resource_type: 'note',
            resource_id: noteId,
            token,
          })
          .select('id, token, revoked_at, view_count')
          .single(),
      ) as ShareLink;
    },
    onSuccess: (_link, noteId) => {
      void queryClient.invalidateQueries({ queryKey: ['share', noteId] });
    },
  });
}

export function useRevokeShareLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { linkId: string; noteId: string }) => {
      unwrap(
        await supabase
          .from('share_links')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', input.linkId)
          .select('id')
          .single(),
      );
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: ['share', input.noteId] });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Renders a note as Markdown.
 *
 * Being unable to get your notes out of the app is a recurring complaint about
 * this category. Vela's notes are yours; this is the escape hatch.
 */
export function noteToMarkdown(note: Note, blocks: NoteBlock[]): string {
  const lines: string[] = [`# ${note.title}`, ''];
  if (note.summary) lines.push(`> ${note.summary}`, '');

  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        lines.push(`${'#'.repeat(Math.min(6, (block.level ?? 1) + 1))} ${block.content}`, '');
        break;
      case 'bullet':
        lines.push(`- ${block.content}`);
        break;
      case 'numbered':
        lines.push(`1. ${block.content}`);
        break;
      case 'definition':
        lines.push(`**${block.term ?? ''}** — ${block.content}`, '');
        break;
      case 'key_fact':
        lines.push(`> **Key fact:** ${block.content}`, '');
        break;
      case 'callout':
        lines.push(`> ⚠︎ ${block.content}`, '');
        break;
      case 'example':
        lines.push(`*Example:* ${block.content}`, '');
        break;
      case 'formula':
        lines.push('```', block.content, '```', '');
        break;
      case 'quote':
        lines.push(`> ${block.content}`, '');
        break;
      case 'summary':
        lines.push('---', '', `**Summary.** ${block.content}`, '');
        break;
      default:
        lines.push(block.content, '');
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function transcriptToText(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => `[${formatTimestamp(s.start_ms)}] ${s.speaker ? `${s.speaker}: ` : ''}${s.text}`)
    .join('\n');
}

export function formatTimestamp(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
