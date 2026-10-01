import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, Button, EmptyState, Icon, ProgressBar, Screen, Text } from '../../src/components';
import { t } from '../../src/i18n';
import { track } from '../../src/services/analytics';
import { useDueCards, useGradeCard, toCardState, type DueCard } from '../../src/services/review';
import { formatDueRelative, previewIntervals, type ReviewGrade } from '../../src/services/scheduler';
import { useReduceMotion, useTheme } from '../../src/theme/ThemeProvider';
import { motion, radius, space as spacing } from '../../src/theme/tokens';

const GRADES: { key: ReviewGrade; labelKey: string; tone: 'danger' | 'warning' | 'success' | 'accent' }[] = [
  { key: 'again', labelKey: 'cards.again', tone: 'danger' },
  { key: 'hard', labelKey: 'cards.hard', tone: 'warning' },
  { key: 'good', labelKey: 'cards.good', tone: 'success' },
  { key: 'easy', labelKey: 'cards.easy', tone: 'accent' },
];

/**
 * A review session.
 *
 * Every grading button shows the interval it will produce, because a student
 * who cannot see the consequence of "Hard" versus "Good" just presses "Good"
 * every time and the schedule becomes meaningless.
 */
export default function Review() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const params = useLocalSearchParams<{ spaceId?: string }>();

  const due = useDueCards(params.spaceId);
  const gradeCard = useGradeCard();

  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [nextDue, setNextDue] = useState<Date | null>(null);
  const shownAt = useRef(0);

  const flip = useSharedValue(0);

  const cards = due.data ?? [];
  const card: DueCard | undefined = cards[index];
  const finished = !due.isLoading && cards.length > 0 && index >= cards.length;

  useEffect(() => {
    if (cards.length > 0 && index === 0 && reviewed === 0) {
      track('review_session_started', { count: cards.length });
    }
  }, [cards.length, index, reviewed]);

  useEffect(() => {
    shownAt.current = Date.now();
    setRevealed(false);
    flip.value = 0;
  }, [index, flip]);

  const intervals = useMemo(
    () => (card ? previewIntervals(toCardState(card)) : null),
    [card],
  );

  const reveal = useCallback(() => {
    setRevealed(true);
    Haptics.selectionAsync().catch(() => {});
    flip.value = reduceMotion
      ? withTiming(1, { duration: motion.duration.instant })
      : withSpring(1, motion.spring.pop);
  }, [flip, reduceMotion]);

  const submit = useCallback(
    async (reviewGrade: ReviewGrade) => {
      if (!card) return;

      Haptics.impactAsync(
        reviewGrade === 'again' ? Haptics.ImpactFeedbackStyle.Rigid : Haptics.ImpactFeedbackStyle.Light,
      ).catch(() => {});

      const durationMs = Date.now() - shownAt.current;

      // Advance immediately; the write happens behind the moving card so the
      // session never stutters between cards.
      setIndex((i) => i + 1);
      setReviewed((n) => n + 1);
      track('card_graded', { grade: reviewGrade, tier: card.tier });

      try {
        const result = await gradeCard.mutateAsync({ card, reviewGrade, durationMs });
        setNextDue(result.dueAt);
      } catch {
        // The schedule for this one card may be lost; the rest of the session
        // continues, and the card simply stays due.
      }
    },
    [card, gradeCard],
  );

  const frontStyle = useAnimatedStyle(() => ({ opacity: 1 - flip.value }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: flip.value,
    transform: [{ translateY: (1 - flip.value) * 8 }],
  }));

  /* --- states ------------------------------------------------------------ */

  if (due.isLoading) {
    return (
      <Screen>
        <Header onClose={() => router.back()} progress={0} />
        <View style={styles.center}>
          <Text variant="callout" color="textTertiary">
            {t('common.loading')}
          </Text>
        </View>
      </Screen>
    );
  }

  if (due.error) {
    return (
      <Screen>
        <Header onClose={() => router.back()} progress={0} />
        <Banner
          tone="danger"
          title={t('errors.genericTitle')}
          message={t('errors.genericBody')}
          actionLabel={t('common.retry')}
          onAction={() => void due.refetch()}
        />
      </Screen>
    );
  }

  if (cards.length === 0) {
    return (
      <Screen>
        <Header onClose={() => router.back()} progress={0} />
        <EmptyState
          icon="check-circle"
          title={t('cards.noneDue')}
          body={t('cards.noneDueBody', { when: 'soon' })}
          actionLabel={t('quiz.start')}
          onAction={() =>
            router.replace({ pathname: '/quiz/new', params: { spaceId: params.spaceId } })
          }
          secondaryLabel={t('common.back')}
          onSecondary={() => router.back()}
        />
      </Screen>
    );
  }

  if (finished) {
    return (
      <Screen>
        <Header onClose={() => router.back()} progress={1} />
        <View style={styles.center}>
          <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(motion.duration.slow)}>
            <View style={[styles.doneIcon, { backgroundColor: theme.colors.successSurface }]}>
              <Icon name="check" size={30} color="success" />
            </View>
          </Animated.View>
          <Text variant="title2" align="center">
            {t('cards.sessionDone')}
          </Text>
          <Text variant="callout" color="textSecondary" align="center">
            {t('cards.sessionDoneBody', {
              reviewed,
              when: nextDue ? formatDueRelative(nextDue) : 'soon',
            })}
          </Text>
          <Button label={t('common.done')} onPress={() => router.back()} style={styles.doneAction} />
        </View>
      </Screen>
    );
  }

  /* --- the card ---------------------------------------------------------- */

  return (
    <Screen>
      <Header onClose={() => router.back()} progress={index / cards.length} />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.cardScroll}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={revealed ? undefined : reveal}
          accessibilityRole="button"
          accessibilityLabel={revealed ? card!.front : `${card!.front}. ${t('cards.showAnswer')}`}
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Text variant="micro" color="textTertiary" uppercase>
            {tierLabel(card!.tier)}
          </Text>

          <Animated.View style={frontStyle}>
            <Text variant="title2" align="center" style={styles.front}>
              {card!.front}
            </Text>
          </Animated.View>

          {revealed ? (
            <Animated.View style={[styles.back, backStyle]}>
              <View style={[styles.rule, { backgroundColor: theme.colors.border }]} />

              <Text variant="title3" align="center">
                {card!.back}
              </Text>

              {card!.explanation ? (
                <View style={[styles.why, { backgroundColor: theme.colors.fill }]}>
                  <Text variant="micro" color="textTertiary" uppercase>
                    {t('cards.whyLabel')}
                  </Text>
                  <Text variant="callout" color="textSecondary">
                    {card!.explanation}
                  </Text>
                </View>
              ) : null}
            </Animated.View>
          ) : null}
        </Pressable>
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.base }]}>
        {!revealed ? (
          <Button label={t('cards.showAnswer')} size="lg" fullWidth onPress={reveal} />
        ) : (
          <Animated.View
            entering={reduceMotion ? undefined : FadeIn.duration(motion.duration.fast)}
            exiting={reduceMotion ? undefined : FadeOut.duration(motion.duration.instant)}
            style={styles.grades}
          >
            {GRADES.map((option) => (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityLabel={`${t(option.labelKey as never)}, next in ${intervals?.[option.key] ?? ''}`}
                onPress={() => void submit(option.key)}
                style={({ pressed }) => [
                  styles.grade,
                  {
                    backgroundColor: toneSurface(theme, option.tone),
                    opacity: pressed ? 0.75 : 1,
                  },
                ]}
              >
                <Text variant="captionStrong" tint={toneColor(theme, option.tone)}>
                  {t(option.labelKey as never)}
                </Text>
                {/* Showing the cost is what keeps grading honest. */}
                <Text variant="micro" color="textTertiary">
                  {intervals?.[option.key] ?? ''}
                </Text>
              </Pressable>
            ))}
          </Animated.View>
        )}
      </View>
    </Screen>
  );
}

function Header({ onClose, progress }: { onClose: () => void; progress: number }) {
  return (
    <View style={styles.header}>
      <Button
        label=""
        variant="ghost"
        size="sm"
        accessibilityLabel={t('common.close')}
        icon={<Icon name="x" size={20} color="textSecondary" />}
        onPress={onClose}
        style={styles.headerButton}
      />
      <ProgressBar value={progress} height={4} label={t('cards.review')} style={styles.flex} />
      <View style={styles.headerButton} />
    </View>
  );
}

function tierLabel(tier: DueCard['tier']): string {
  switch (tier) {
    case 'intro': return t('cards.tierIntro');
    case 'core': return t('cards.tierCore');
    case 'advanced': return t('cards.tierAdvanced');
  }
}

function toneColor(theme: ReturnType<typeof useTheme>, tone: string): string {
  switch (tone) {
    case 'danger': return theme.colors.danger;
    case 'warning': return theme.colors.warning;
    case 'success': return theme.colors.success;
    default: return theme.colors.accent;
  }
}

function toneSurface(theme: ReturnType<typeof useTheme>, tone: string): string {
  switch (tone) {
    case 'danger': return theme.colors.dangerSurface;
    case 'warning': return theme.colors.warningSurface;
    case 'success': return theme.colors.successSurface;
    default: return theme.colors.accentSurface;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.base,
  },
  headerButton: { width: 40, paddingHorizontal: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  doneIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  doneAction: { marginTop: spacing.lg, minWidth: 200 },

  cardScroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.lg },
  card: {
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    gap: spacing.base,
    minHeight: 220,
    justifyContent: 'center',
  },
  front: { marginVertical: spacing.md },
  back: { gap: spacing.base },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: spacing.xs },
  why: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md },

  actions: { gap: spacing.sm },
  grades: { flexDirection: 'row', gap: spacing.sm },
  grade: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    minHeight: 56,
  },
});
