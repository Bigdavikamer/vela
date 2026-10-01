import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Banner, Button, Card, Icon, ProgressRing, ScrollScreen, Text } from '../../../src/components';
import { t } from '../../../src/i18n';
import { supabase, unwrap } from '../../../src/lib/supabase';
import { attemptBreakdown } from '../../../src/services/quizzes';
import { useReduceMotion, useTheme } from '../../../src/theme/ThemeProvider';
import { motion, space as spacing } from '../../../src/theme/tokens';

/**
 * Results.
 *
 * A percentage on its own tells a student nothing they can act on, so the
 * breakdown by concept is the point of this screen — and every route out of it
 * is a way to close a specific gap.
 */
export default function QuizResults() {
  const router = useRouter();
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();

  const attempt = useQuery({
    queryKey: ['attempt', attemptId],
    enabled: Boolean(attemptId),
    queryFn: async () => {
      const row = unwrap(
        await supabase
          .from('quiz_attempts')
          .select('id, quiz_set_id, total, correct, score')
          .eq('id', attemptId!)
          .single(),
      ) as { id: string; quiz_set_id: string; total: number; correct: number; score: number | null };

      const breakdown = await attemptBreakdown(attemptId!);
      const quizSet = unwrap(
        await supabase.from('quiz_sets').select('space_id').eq('id', row.quiz_set_id).single(),
      ) as { space_id: string };

      return { ...row, ...breakdown, spaceId: quizSet.space_id };
    },
  });

  if (attempt.isLoading) {
    return (
      <ScrollScreen>
        <View style={styles.center}>
          <Text variant="callout" color="textTertiary">
            {t('common.loading')}
          </Text>
        </View>
      </ScrollScreen>
    );
  }

  if (!attempt.data) {
    return (
      <ScrollScreen>
        <Banner tone="danger" title={t('errors.notFound')} message={t('errors.notFoundBody')} />
      </ScrollScreen>
    );
  }

  const score = attempt.data.score ?? 0;
  const percent = Math.round(score * 100);
  const verdict =
    score >= 0.8 ? t('quiz.resultsSolid') : score >= 0.5 ? t('quiz.resultsMixed') : t('quiz.resultsRough');

  const tone = score >= 0.8 ? theme.colors.success : score >= 0.5 ? theme.colors.warning : theme.colors.danger;

  return (
    <ScrollScreen>
      <Animated.View
        entering={reduceMotion ? undefined : FadeInDown.duration(motion.duration.slow)}
        style={styles.hero}
      >
        <ProgressRing value={score} size={128} strokeWidth={9} tint={tone} label={t('quiz.resultsTitle', { score: percent })}>
          <Text variant="display" tint={tone}>
            {percent}%
          </Text>
        </ProgressRing>

        <Text variant="title3" align="center">
          {verdict}
        </Text>
        <Text variant="caption" color="textTertiary" align="center">
          {attempt.data.correct} / {attempt.data.total}
        </Text>
      </Animated.View>

      {attempt.data.mastered.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="check-circle" size={16} color="success" />
            <Text variant="title3">{t('quiz.mastered')}</Text>
          </View>
          <Card padded={false}>
            {attempt.data.mastered.map((concept, i) => (
              <View key={concept.id} style={[styles.row, i > 0 ? styles.divider : null]}>
                <Text variant="body" style={styles.flex} numberOfLines={1}>
                  {concept.name}
                </Text>
                <Text variant="caption" color="success">
                  {concept.correct}/{concept.total}
                </Text>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {attempt.data.missed.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="target" size={16} color="warning" />
            <Text variant="title3">{t('quiz.missed')}</Text>
          </View>
          <Card padded={false}>
            {attempt.data.missed.map((concept, i) => (
              <View key={concept.id} style={[styles.row, i > 0 ? styles.divider : null]}>
                <Text variant="body" style={styles.flex} numberOfLines={1}>
                  {concept.name}
                </Text>
                <Text variant="caption" color="warning">
                  {concept.correct}/{concept.total}
                </Text>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      <View style={styles.actions}>
        {attempt.data.missed.length > 0 ? (
          <Button
            label={t('quiz.reviewMissed')}
            fullWidth
            icon={<Icon name="target" size={16} tint={theme.colors.onAccent} />}
            onPress={() =>
              router.replace({
                pathname: '/quiz/new',
                params: { spaceId: attempt.data!.spaceId },
              })
            }
          />
        ) : null}
        <Button
          label={t('cards.review')}
          variant="secondary"
          fullWidth
          onPress={() =>
            router.replace({ pathname: '/review', params: { spaceId: attempt.data!.spaceId } })
          }
        />
        <Button label={t('common.done')} variant="ghost" fullWidth onPress={() => router.dismissAll()} />
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: spacing.giant },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  section: { gap: spacing.md, marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#8883' },
  actions: { gap: spacing.sm, marginTop: spacing.base },
});
