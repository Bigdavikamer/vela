import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, Button, Chip, Field, Icon, Screen, Text } from '../../src/components';
import { t } from '../../src/i18n';
import type { Citation, TutorMode } from '../../src/lib/api';
import { track } from '../../src/services/analytics';
import { useSendMessage, useThreadMessages, TUTOR_MODES } from '../../src/services/tutor';
import { useSpace } from '../../src/services/spaces';
import { useReduceMotion, useTheme } from '../../src/theme/ThemeProvider';
import { motion, radius, space as spacing } from '../../src/theme/tokens';

/**
 * The tutor.
 *
 * Scoped to the whole space by default — asking "what do I need for the exam"
 * should draw on every lecture and PDF in the subject, which is precisely what
 * one-note chat cannot do. Every answer shows what it was based on.
 */
export default function Tutor() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { spaceId, sourceId } = useLocalSearchParams<{ spaceId: string; sourceId?: string }>();

  const space = useSpace(spaceId);
  const send = useSendMessage();

  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<TutorMode>('explain');
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const messages = useThreadMessages(threadId);

  const submit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !spaceId) return;

      setDraft('');
      track('tutor_message_sent', { mode });

      try {
        const result = await send.mutateAsync({
          threadId,
          spaceId,
          sourceId: sourceId ?? null,
          mode,
          message: trimmed,
        });
        setThreadId(result.threadId);
      } catch {
        // The hook rolls the optimistic message back; hand the text back so it
        // is not lost.
        setDraft(trimmed);
      }
    },
    [spaceId, sourceId, mode, threadId, send],
  );

  const list = messages.data ?? [];
  const empty = list.length === 0 && !send.isPending;

  const suggestions = useMemo(
    () => [t('tutor.suggestion1'), t('tutor.suggestion2'), t('tutor.suggestion3')],
    [],
  );

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Button
          label=""
          variant="ghost"
          size="sm"
          accessibilityLabel={t('common.back')}
          icon={<Icon name="arrow-left" size={20} color="textSecondary" />}
          onPress={() => router.back()}
          style={styles.headerButton}
        />
        <View style={styles.headerBody}>
          <Text variant="captionStrong" numberOfLines={1}>
            {t('tutor.title')}
          </Text>
          <Text variant="micro" color="textTertiary" numberOfLines={1}>
            {t('tutor.scopeSpace', { space: space.data?.name ?? '' })}
          </Text>
        </View>
        <View style={styles.headerButton} />
      </View>

      {/* Modes are behaviours of one tutor, not seven separate tools. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.modes}
      >
        {TUTOR_MODES.map((option) => (
          <Chip
            key={option.value}
            label={t(option.labelKey as never)}
            selected={mode === option.value}
            onPress={() => setMode(option.value)}
          />
        ))}
      </ScrollView>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.thread}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: !reduceMotion })}
          keyboardShouldPersistTaps="handled"
        >
          {empty ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.colors.accentSurface }]}>
                <Icon name="message-circle" size={22} color="accent" />
              </View>
              <Text variant="title3" align="center">
                {t('tutor.emptyTitle')}
              </Text>
              <Text variant="callout" color="textSecondary" align="center" style={styles.emptyBody}>
                {t('tutor.emptyBody')}
              </Text>

              <View style={styles.suggestions}>
                {suggestions.map((suggestion) => (
                  <Pressable
                    key={suggestion}
                    accessibilityRole="button"
                    accessibilityLabel={suggestion}
                    onPress={() => void submit(suggestion)}
                    style={({ pressed }) => [
                      styles.suggestion,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor: theme.colors.border,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text variant="callout">{suggestion}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {list.map((message) => (
            <MessageBubble
              key={message.id}
              role={message.role}
              content={message.content}
              citations={message.citations}
              ungrounded={message.ungrounded}
              onOpenCitation={(citation) => {
                if (citation.source_id) {
                  router.push({ pathname: '/source/[id]', params: { id: citation.source_id } });
                }
              }}
            />
          ))}

          {send.isPending ? (
            <Animated.View
              entering={reduceMotion ? undefined : FadeIn.duration(motion.duration.fast)}
              style={[styles.thinking, { backgroundColor: theme.colors.fill }]}
            >
              <ActivityIndicator size="small" color={theme.colors.textTertiary} />
              <Text variant="caption" color="textTertiary">
                {t('tutor.thinking')}
              </Text>
            </Animated.View>
          ) : null}

          {send.error ? (
            <Banner
              tone="danger"
              title={(send.error as Error).message}
              style={styles.error}
            />
          ) : null}
        </ScrollView>

        <View
          style={[
            styles.composer,
            {
              borderTopColor: theme.colors.border,
              backgroundColor: theme.colors.bg,
              paddingBottom: insets.bottom + spacing.sm,
            },
          ]}
        >
          <Field
            value={draft}
            onChangeText={setDraft}
            placeholder={t('tutor.placeholder')}
            multiline
            multilineMinHeight={44}
            containerStyle={styles.flex}
            returnKeyType="send"
            onSubmitEditing={() => void submit(draft)}
            blurOnSubmit={false}
          />
          <Button
            label=""
            accessibilityLabel={t('common.continue')}
            icon={<Icon name="arrow-up" size={18} tint={theme.colors.onAccent} />}
            disabled={!draft.trim() || send.isPending}
            onPress={() => void submit(draft)}
            style={styles.sendButton}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function MessageBubble({
  role,
  content,
  citations,
  ungrounded,
  onOpenCitation,
}: {
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  ungrounded: boolean;
  onOpenCitation: (citation: Citation) => void;
}) {
  const theme = useTheme();
  const isUser = role === 'user';

  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRight : styles.bubbleLeft]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isUser ? theme.colors.accentSurface : theme.colors.surface,
            borderColor: isUser ? 'transparent' : theme.colors.border,
            borderWidth: isUser ? 0 : StyleSheet.hairlineWidth * 2,
          },
        ]}
      >
        <Text variant="reading" selectable>
          {content}
        </Text>

        {/* Grounding made visible: what the answer came from, or a clear note
            that the material did not cover it. */}
        {!isUser && ungrounded ? (
          <View style={styles.ungrounded}>
            <Icon name="alert-circle" size={12} color="warning" />
            <Text variant="micro" color="warning" style={styles.flex}>
              Not from your material
            </Text>
          </View>
        ) : null}

        {!isUser && citations.length > 0 ? (
          <View style={styles.citations}>
            <Text variant="micro" color="textTertiary" uppercase>
              {t('tutor.citations')}
            </Text>
            <View style={styles.citationChips}>
              {citations.map((citation) => (
                <Pressable
                  key={citation.label}
                  accessibilityRole="link"
                  accessibilityLabel={citation.quote}
                  onPress={() => onOpenCitation(citation)}
                  style={[styles.citation, { backgroundColor: theme.colors.fill }]}
                >
                  <Text variant="micro" color="accent">
                    [{citation.label}]
                  </Text>
                  <Text variant="micro" color="textSecondary" numberOfLines={1} style={styles.flex}>
                    {citation.quote}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    marginTop: spacing.sm,
  },
  headerButton: { width: 40, paddingHorizontal: 0 },
  headerBody: { flex: 1, alignItems: 'center' },
  modes: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.md },

  thread: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBody: { maxWidth: 300 },
  suggestions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.base },
  suggestion: {
    padding: spacing.base,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    minHeight: 52,
    justifyContent: 'center',
  },

  bubbleRow: { flexDirection: 'row' },
  bubbleLeft: { justifyContent: 'flex-start' },
  bubbleRight: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '92%', padding: spacing.base, borderRadius: radius.lg, gap: spacing.sm },
  ungrounded: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  citations: { gap: spacing.xs, marginTop: spacing.xs },
  citationChips: { gap: spacing.xs },
  citation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.xs,
  },

  thinking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  error: { marginTop: spacing.sm },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sendButton: { width: 48, paddingHorizontal: 0 },
});
