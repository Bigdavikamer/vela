import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';
import { qk } from '../lib/queryClient';
import { supabase, unwrap } from '../lib/supabase';
import { useUserId } from '../stores/auth';

/**
 * Exam preparation.
 *
 * Readiness is computed from real evidence (concept importance weighted by the
 * student's measured mastery) and is always presented as study guidance. Vela
 * does not predict grades and the UI says so wherever readiness appears.
 */

export type Exam = {
  id: string;
  space_id: string;
  title: string;
  exam_date: string;
  notes: string | null;
  status: 'active' | 'done' | 'archived';
  readiness: number;
  readiness_updated_at: string | null;
  plan_generated_at: string | null;
};

export type PlanItem = {
  id: string;
  exam_id: string;
  scheduled_for: string;
  kind: 'review' | 'flashcards' | 'quiz' | 'read' | 'drill';
  title: string;
  target: { concept_ids?: string[] };
  estimated_minutes: number;
  priority: number;
  completed_at: string | null;
  skipped_at: string | null;
};

export function useExams(spaceId?: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: [...qk.exams(), spaceId ?? 'all'],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Exam[]> => {
      let query = supabase
        .from('exams')
        .select('*')
        .eq('status', 'active')
        .order('exam_date', { ascending: true });

      if (spaceId) query = query.eq('space_id', spaceId);

      const rows = unwrap(await query) as Exam[];
      return rows.map((e) => ({ ...e, readiness: Number(e.readiness) }));
    },
  });
}

export function useExam(examId: string | undefined) {
  return useQuery({
    queryKey: qk.exam(examId ?? ''),
    enabled: Boolean(examId),
    queryFn: async (): Promise<Exam> => {
      const exam = unwrap(
        await supabase.from('exams').select('*').eq('id', examId!).single(),
      ) as Exam;
      return { ...exam, readiness: Number(exam.readiness) };
    },
  });
}

export function useExamPlan(examId: string | undefined) {
  return useQuery({
    queryKey: qk.examPlan(examId ?? ''),
    enabled: Boolean(examId),
    queryFn: async (): Promise<PlanItem[]> =>
      unwrap(
        await supabase
          .from('study_plan_items')
          .select('*')
          .eq('exam_id', examId!)
          .order('scheduled_for', { ascending: true })
          .order('priority', { ascending: false }),
      ) as PlanItem[],
  });
}

export function useCreateExam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      spaceId: string;
      title: string;
      examDate: string;
      notes?: string;
    }): Promise<Exam> => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not signed in');

      return unwrap(
        await supabase
          .from('exams')
          .insert({
            user_id: userData.user.id,
            space_id: input.spaceId,
            title: input.title.trim(),
            exam_date: input.examDate,
            notes: input.notes?.trim() || null,
          })
          .select('*')
          .single(),
      ) as Exam;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.exams() });
    },
  });
}

export function useBuildPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (examId: string) => api.examPlan(examId),
    onSuccess: (_result, examId) => {
      void queryClient.invalidateQueries({ queryKey: qk.examPlan(examId) });
      void queryClient.invalidateQueries({ queryKey: qk.exam(examId) });
      void queryClient.invalidateQueries({ queryKey: qk.exams() });
    },
  });
}

export function useCompletePlanItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { itemId: string; examId: string }) => {
      unwrap(
        await supabase
          .from('study_plan_items')
          .update({ completed_at: new Date().toISOString() })
          .eq('id', input.itemId)
          .select('id')
          .single(),
      );
      // Completing work changes what the student knows, so readiness is stale.
      await api.examReadiness(input.examId).catch(() => undefined);
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: qk.examPlan(input.examId) });
      void queryClient.invalidateQueries({ queryKey: qk.exam(input.examId) });
    },
  });
}

export function useDeleteExam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (examId: string) => {
      const { error } = await supabase.from('exams').delete().eq('id', examId);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.exams() });
    },
  });
}

/** Whole days from today (UTC) to the exam. Negative once it has passed. */
export function daysUntil(examDate: string, now = new Date()): number {
  const target = new Date(`${examDate}T00:00:00.000Z`);
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function todayIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}
