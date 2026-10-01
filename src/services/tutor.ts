import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type Citation, type TutorMode } from '../lib/api';
import { qk } from '../lib/queryClient';
import { supabase, unwrap } from '../lib/supabase';

export type ChatThread = {
  id: string;
  space_id: string;
  source_id: string | null;
  title: string;
  mode: TutorMode;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  ungrounded: boolean;
  created_at: string;
};

export function useThreads(spaceId: string | undefined) {
  return useQuery({
    queryKey: qk.threads(spaceId ?? ''),
    enabled: Boolean(spaceId),
    queryFn: async (): Promise<ChatThread[]> =>
      unwrap(
        await supabase
          .from('chat_threads')
          .select('*')
          .eq('space_id', spaceId!)
          .order('updated_at', { ascending: false })
          .limit(50),
      ) as ChatThread[],
  });
}

export function useThreadMessages(threadId: string | undefined) {
  return useQuery({
    queryKey: qk.thread(threadId ?? ''),
    enabled: Boolean(threadId),
    queryFn: async (): Promise<ChatMessage[]> =>
      unwrap(
        await supabase
          .from('chat_messages')
          .select('*')
          .eq('thread_id', threadId!)
          .order('created_at', { ascending: true }),
      ) as unknown as ChatMessage[],
  });
}

/**
 * Sends a message to the tutor.
 *
 * The student's own message is written into the cache immediately so the
 * conversation never appears to swallow what they typed while the model
 * thinks. If the request fails, that optimistic message is rolled back and the
 * text is handed back to the composer rather than lost.
 */
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      threadId?: string;
      spaceId: string;
      sourceId?: string | null;
      mode?: TutorMode;
      message: string;
    }) => api.tutor(input),

    onMutate: async (input) => {
      if (!input.threadId) return { previous: undefined, threadId: undefined };

      const key = qk.thread(input.threadId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ChatMessage[]>(key);

      queryClient.setQueryData<ChatMessage[]>(key, (old = []) => [
        ...old,
        {
          id: `optimistic-${Date.now()}`,
          thread_id: input.threadId!,
          role: 'user',
          content: input.message,
          citations: [],
          ungrounded: false,
          created_at: new Date().toISOString(),
        },
      ]);

      return { previous, threadId: input.threadId };
    },

    onError: (_error, _input, context) => {
      if (context?.threadId && context.previous) {
        queryClient.setQueryData(qk.thread(context.threadId), context.previous);
      }
    },

    onSuccess: (result, input) => {
      void queryClient.invalidateQueries({ queryKey: qk.thread(result.threadId) });
      void queryClient.invalidateQueries({ queryKey: qk.threads(input.spaceId) });
    },
  });
}

export function useDeleteThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { threadId: string; spaceId: string }) => {
      const { error } = await supabase.from('chat_threads').delete().eq('id', input.threadId);
      if (error) throw error;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: qk.threads(input.spaceId) });
    },
  });
}

export const TUTOR_MODES: { value: TutorMode; labelKey: string }[] = [
  { value: 'explain', labelKey: 'tutor.modeExplain' },
  { value: 'learn', labelKey: 'tutor.modeLearn' },
  { value: 'quiz_me', labelKey: 'tutor.modeQuiz' },
  { value: 'test_me', labelKey: 'tutor.modeTest' },
  { value: 'find_gaps', labelKey: 'tutor.modeGaps' },
  { value: 'summarize', labelKey: 'tutor.modeSummarize' },
  { value: 'deep_dive', labelKey: 'tutor.modeDeepDive' },
];
