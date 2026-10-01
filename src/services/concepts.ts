import { useQuery } from '@tanstack/react-query';

import { qk } from '../lib/queryClient';
import { supabase, unwrap } from '../lib/supabase';
import { useUserId } from '../stores/auth';

/**
 * Concepts — the unit Vela actually tracks understanding in.
 *
 * Mastery lives on the concept rather than the card, so "what don't I
 * understand" has one answer drawn from every card and quiz question that
 * touched the idea, instead of a per-card score that means nothing on its own.
 */

export type Concept = {
  id: string;
  space_id: string;
  name: string;
  definition: string | null;
  importance: number;
  mastery: number;
  mastery_updated_at: string | null;
  first_source_id: string | null;
};

export type ConceptLink = {
  from_concept: string;
  to_concept: string;
  relation: 'related' | 'prerequisite_of' | 'part_of' | 'causes' | 'contrasts_with' | 'example_of';
  weight: number;
};

export function useConcepts(spaceId: string | undefined) {
  return useQuery({
    queryKey: qk.concepts(spaceId ?? ''),
    enabled: Boolean(spaceId),
    queryFn: async (): Promise<Concept[]> => {
      const rows = unwrap(
        await supabase
          .from('concepts')
          .select('*')
          .eq('space_id', spaceId!)
          .order('importance', { ascending: false })
          .order('name', { ascending: true }),
      ) as Concept[];
      return rows.map((c) => ({ ...c, mastery: Number(c.mastery) }));
    },
  });
}

/** Concepts with evidence that the student is struggling. */
export function useWeakConcepts(spaceId?: string, limit = 8) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['weakConcepts', spaceId ?? 'all'],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Concept[]> => {
      let query = supabase
        .from('concepts')
        .select('*')
        // Only concepts we have actually seen the student attempt: a concept
        // with no evidence is not "weak", it is untouched, and showing it as a
        // weakness would be dishonest.
        .not('mastery_updated_at', 'is', null)
        .lt('mastery', 0.6)
        .order('mastery', { ascending: true })
        .limit(limit);

      if (spaceId) query = query.eq('space_id', spaceId);

      const rows = unwrap(await query) as Concept[];
      return rows.map((c) => ({ ...c, mastery: Number(c.mastery) }));
    },
  });
}

/** The concept map: nodes plus the relationships between them. */
export function useConceptMap(spaceId: string | undefined) {
  return useQuery({
    queryKey: qk.conceptMap(spaceId ?? ''),
    enabled: Boolean(spaceId),
    queryFn: async (): Promise<{ concepts: Concept[]; links: ConceptLink[] }> => {
      const concepts = (unwrap(
        await supabase.from('concepts').select('*').eq('space_id', spaceId!),
      ) as Concept[]).map((c) => ({ ...c, mastery: Number(c.mastery) }));

      if (concepts.length === 0) return { concepts: [], links: [] };

      const links = unwrap(
        await supabase
          .from('concept_links')
          .select('from_concept, to_concept, relation, weight')
          .in('from_concept', concepts.map((c) => c.id)),
      ) as ConceptLink[];

      // Drop links pointing outside this space so the map cannot render an edge
      // to a node it is not drawing.
      const ids = new Set(concepts.map((c) => c.id));
      return { concepts, links: links.filter((l) => ids.has(l.to_concept)) };
    },
  });
}

/** Everything that mentions a concept — the "show me where this came from" view. */
export function useConceptSources(conceptId: string | undefined) {
  return useQuery({
    queryKey: ['conceptSources', conceptId ?? ''],
    enabled: Boolean(conceptId),
    queryFn: async () => {
      const mentions = unwrap(
        await supabase
          .from('concept_mentions')
          .select('source_id, note_block_id')
          .eq('concept_id', conceptId!),
      ) as { source_id: string | null; note_block_id: string | null }[];

      const sourceIds = [...new Set(mentions.map((m) => m.source_id).filter((id): id is string => !!id))];
      if (sourceIds.length === 0) return [];

      return unwrap(
        await supabase.from('sources').select('id, title, kind').in('id', sourceIds),
      ) as { id: string; title: string; kind: string }[];
    },
  });
}

export function masteryLabel(mastery: number, hasEvidence: boolean): string {
  if (!hasEvidence) return 'Not started';
  if (mastery < 0.2) return 'Shaky';
  if (mastery < 0.45) return 'Getting there';
  if (mastery < 0.7) return 'Steady';
  if (mastery < 0.9) return 'Solid';
  return 'Mastered';
}
