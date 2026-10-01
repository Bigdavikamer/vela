import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from '../lib/queryClient';
import { supabase, unwrap } from '../lib/supabase';
import type { SpaceAccent } from '../theme/tokens';
import type { Database } from '../types/database';
import { spaceAccentKeys } from '../theme/tokens';
import { useUserId } from '../stores/auth';

export type StudySpace = {
  id: string;
  name: string;
  description: string | null;
  accent: SpaceAccent;
  icon: string | null;
  archived_at: string | null;
  last_opened_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SpaceSummary = StudySpace & {
  sourceCount: number;
  dueCount: number;
};

/* -------------------------------------------------------------------------- */
/* Queries                                                                    */
/* -------------------------------------------------------------------------- */

export function useSpaces() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.spaces(),
    enabled: Boolean(userId),
    queryFn: async (): Promise<SpaceSummary[]> => {
      const spaces = unwrap(
        await supabase
          .from('study_spaces')
          .select('*')
          .is('archived_at', null)
          .order('last_opened_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }),
      ) as StudySpace[];

      if (spaces.length === 0) return [];

      // Two aggregate reads rather than N+1: a student with fifteen subjects
      // should not cost fifteen round trips to render the home screen.
      const [counts, due] = await Promise.all([
        supabase
          .from('sources')
          .select('space_id')
          .in('space_id', spaces.map((s) => s.id))
          // Counts material the student has actually added, including anything
          // still processing. Counting only `ready` made a space read "0
          // sources" seconds after they added one, which looks like data loss.
          .not('status', 'in', '("failed","canceled")'),
        supabase.rpc('due_counts'),
      ]);

      const sourceCounts = new Map<string, number>();
      for (const row of ((counts.data ?? []) as { space_id: string }[])) {
        sourceCounts.set(row.space_id, (sourceCounts.get(row.space_id) ?? 0) + 1);
      }

      const dueCounts = new Map<string, number>();
      for (const row of ((due.data ?? []) as { space_id: string; due_count: number }[])) {
        dueCounts.set(row.space_id, Number(row.due_count));
      }

      return spaces.map((space) => ({
        ...space,
        sourceCount: sourceCounts.get(space.id) ?? 0,
        dueCount: dueCounts.get(space.id) ?? 0,
      }));
    },
  });
}

export function useSpace(spaceId: string | undefined) {
  return useQuery({
    queryKey: qk.space(spaceId ?? ''),
    enabled: Boolean(spaceId),
    queryFn: async (): Promise<StudySpace> =>
      unwrap(
        await supabase.from('study_spaces').select('*').eq('id', spaceId!).single(),
      ) as StudySpace,
  });
}

/* -------------------------------------------------------------------------- */
/* Mutations                                                                  */
/* -------------------------------------------------------------------------- */

export function useCreateSpace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; accent?: SpaceAccent; description?: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not signed in');

      return unwrap(
        await supabase
          .from('study_spaces')
          .insert({
            user_id: userData.user.id,
            name: input.name.trim(),
            description: input.description?.trim() || null,
            accent: input.accent ?? pickAccent(input.name),
            last_opened_at: new Date().toISOString(),
          })
          .select('*')
          .single(),
      ) as StudySpace;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.spaces() });
    },
  });
}

export function useUpdateSpace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; accent?: SpaceAccent; description?: string | null }) => {
      const patch: Database['public']['Tables']['study_spaces']['Update'] = {};
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.accent !== undefined) patch.accent = input.accent;
      if (input.description !== undefined) patch.description = input.description;

      return unwrap(
        await supabase.from('study_spaces').update(patch).eq('id', input.id).select('*').single(),
      ) as StudySpace;
    },
    onSuccess: (space) => {
      void queryClient.invalidateQueries({ queryKey: qk.spaces() });
      void queryClient.invalidateQueries({ queryKey: qk.space(space.id) });
    },
  });
}

export function useArchiveSpace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (spaceId: string) => {
      unwrap(
        await supabase
          .from('study_spaces')
          .update({ archived_at: new Date().toISOString() })
          .eq('id', spaceId)
          .select('id')
          .single(),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.spaces() });
    },
  });
}

/**
 * Deletes a space and everything in it. The database cascades from
 * `study_spaces`, so this is one statement rather than a fragile client-side
 * sweep that could half-finish.
 */
export function useDeleteSpace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (spaceId: string) => {
      const { error } = await supabase.from('study_spaces').delete().eq('id', spaceId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.spaces() });
      void queryClient.invalidateQueries({ queryKey: qk.dueCounts() });
    },
  });
}

/** Records that the student opened a space, so Home can order by recency. */
export async function touchSpace(spaceId: string): Promise<void> {
  await supabase
    .from('study_spaces')
    .update({ last_opened_at: new Date().toISOString() })
    .eq('id', spaceId);
}

/**
 * Assigns a stable colour from the space's name so two subjects created in the
 * same session do not come out identical, and so the same name always gets the
 * same colour on a reinstall.
 */
export function pickAccent(name: string): SpaceAccent {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return spaceAccentKeys[hash % spaceAccentKeys.length];
}
