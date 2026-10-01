import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Card,
  EmptyState,
  Icon,
  MasteryMeter,
  ScrollScreen,
  Skeleton,
  Text,
  type IconName,
} from '../../src/components';
import { t } from '../../src/i18n';
import { useWeakConcepts } from '../../src/services/concepts';
import { useDueCounts } from '../../src/services/review';
import { useInsights } from '../../src/services/sessions';
import { useSpaces } from '../../src/services/spaces';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius, space as spacing } from '../../src/theme/tokens';

/**
 * Study is the verb, not the noun: every route out of this screen starts an
 * activity. Progress lives here too, because deciding what to study is exactly
 * when a student needs to know where they are weak.
 */
export default function Study() {
  const router = useRouter();
  const dueCounts = useDueCounts();
  const spaces = useSpaces();
  const weak = useWeakConcepts(undefined, 6);
  const insights = useInsights();

  const totalDue = (dueCounts.data ?? []).reduce((sum, row) => sum + row.due_count, 0);
  const hasMaterial = (spaces.data ?? []).some((s) => s.sourceCount > 0);

  if (spaces.isLoading) {
    return (
      <ScrollScreen>
        <View style={styles.skeleton}>
          <Skeleton width="40%" height={28} />
          <Skeleton height={96} radius={radius.lg} />
          <Skeleton height={96} radius={radius.lg} />
        </View>
      </ScrollScreen>
    );
  }

  if (!hasMaterial) {
    return (
      <ScrollScreen>
        <Text variant="title1" style={styles.header}>
          Study
        </Text>
        <EmptyState
          icon="layers"
          title={t('quiz.noMaterial')}
          body={t('quiz.noMaterialBody')}
          actionLabel={t('home.quickCapture')}
          onAction={() => router.push('/capture')}
        />
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen>
      <Text variant="title1" style={styles.header}>
        Study
      </Text>

      <View style={styles.actions}>
        <ActionCard
          icon="layers"
          title={t('cards.review')}
          subtitle={
            totalDue > 0 ? t('cards.due', { count: totalDue }) : t('cards.noneDue')
          }
          badge={totalDue > 0 ? String(totalDue) : undefined}
          onPress={() => router.push('/review')}
        />

        <ActionCard
          icon="help-circle"
          title={t('quiz.title')}
          subtitle={t('quiz.weakAreasBody')}
          onPress={() => router.push('/quiz/new')}
        />

        <ActionCard
          icon="clock"
          title={t('focus.title')}
          subtitle={t('focus.goalPlaceholder')}
          onPress={() => router.push('/focus')}
        />

        <ActionCard
          icon="calendar"
          title={t('exam.title')}
          subtitle={t('exam.addExam')}
          onPress={() => router.push('/exam')}
        />
      </View>

      {(weak.data ?? []).length > 0 ? (
        <View style={styles.section}>
          <Text variant="title3">{t('insights.weakestConcepts')}</Text>
          <Card padded={false}>
            {(weak.data ?? []).map((concept, index) => (
              <View key={concept.id} style={[styles.row, index > 0 ? styles.divider : null]}>
                <View style={styles.rowBody}>
                  <Text variant="body" numberOfLines={1}>
                    {concept.name}
                  </Text>
                  <MasteryMeter value={concept.mastery} />
                </View>
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text variant="title3">{t('insights.thisWeek')}</Text>
        <View style={styles.stats}>
          <Stat
            label={t('insights.studyTime')}
            value={`${insights.data?.minutesThisWeek ?? 0}m`}
          />
          <Stat label={t('insights.reviewsDone')} value={`${insights.data?.reviewsThisWeek ?? 0}`} />
          <Stat
            label={t('insights.quizAverage')}
            value={
              insights.data?.quizAverage != null
                ? `${Math.round(insights.data.quizAverage * 100)}%`
                : '—'
            }
          />
        </View>
      </View>
    </ScrollScreen>
  );
}

function ActionCard({
  icon,
  title,
  subtitle,
  badge,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  badge?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={`${title}. ${subtitle}`} style={styles.action}>
      <View style={[styles.actionIcon, { backgroundColor: theme.colors.accentSurface }]}>
        <Icon name={icon} size={20} color="accent" />
      </View>
      <View style={styles.actionBody}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {badge ? <Badge label={badge} /> : null}
      <Icon name="chevron-right" size={18} color="textTertiary" />
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.stat}>
      <Text variant="title2">{value}</Text>
      <Text variant="caption" color="textTertiary" numberOfLines={2}>
        {label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.base, marginBottom: spacing.lg },
  actions: { gap: spacing.sm },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBody: { flex: 1, gap: 2 },
  section: { marginTop: spacing.xl, gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#8883' },
  rowBody: { flex: 1, gap: spacing.xs },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, gap: spacing.xs, alignItems: 'flex-start' },
  skeleton: { gap: spacing.base, marginTop: spacing.base },
});
