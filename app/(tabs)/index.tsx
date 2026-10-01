import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  MasteryMeter,
  ProgressBar,
  ScrollScreen,
  Skeleton,
  Text,
} from '../../src/components';
import { t } from '../../src/i18n';
import { useWeakConcepts } from '../../src/services/concepts';
import { daysUntil, useExams } from '../../src/services/exams';
import { useDueCounts } from '../../src/services/review';
import { useInsights } from '../../src/services/sessions';
import { useActiveSources } from '../../src/services/sources';
import { touchSpace, useSpaces, type SpaceSummary } from '../../src/services/spaces';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius, space as spacing } from '../../src/theme/tokens';

/**
 * Home exists to answer one question: what should I do next?
 *
 * It is not a dashboard. There is always exactly one obvious primary action,
 * chosen from real state — material still processing, cards due, an exam
 * approaching, or nothing yet — and everything below it is secondary.
 */
export default function Home() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const spaces = useSpaces();
  const dueCounts = useDueCounts();
  const exams = useExams();
  const weak = useWeakConcepts(undefined, 3);
  const active = useActiveSources();
  const insights = useInsights();

  const totalDue = useMemo(
    () => (dueCounts.data ?? []).reduce((sum, row) => sum + row.due_count, 0),
    [dueCounts.data],
  );

  const nextExam = useMemo(() => {
    const list = exams.data ?? [];
    return list.length > 0 ? list[0] : null;
  }, [exams.data]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      spaces.refetch(),
      dueCounts.refetch(),
      exams.refetch(),
      weak.refetch(),
      active.refetch(),
      insights.refetch(),
    ]);
    setRefreshing(false);
  }, [spaces, dueCounts, exams, weak, active, insights]);

  const openSpace = useCallback(
    (spaceId: string) => {
      void touchSpace(spaceId);
      router.push({ pathname: '/space/[id]', params: { id: spaceId } });
    },
    [router],
  );

  const loading = spaces.isLoading;
  const hasSpaces = (spaces.data?.length ?? 0) > 0;

  return (
    <ScrollScreen
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
    >
      <Header streak={insights.data?.streak ?? 0} />

      {loading ? (
        <HomeSkeleton />
      ) : !hasSpaces ? (
        <EmptyState
          icon="feather"
          title={t('home.emptyTitle')}
          body={t('home.emptyBody')}
          actionLabel={t('home.emptyAction')}
          onAction={() => router.push('/capture')}
        />
      ) : (
        <>
          {(active.data ?? []).length > 0 ? (
            <ProcessingCard
              sources={active.data ?? []}
              onPress={(id) => router.push({ pathname: '/source/[id]', params: { id } })}
            />
          ) : null}

          <NextUp
            totalDue={totalDue}
            onReview={() => router.push('/review')}
            onCapture={() => router.push('/capture')}
          />

          {nextExam ? (
            <ExamCard
              title={nextExam.title}
              days={daysUntil(nextExam.exam_date)}
              readiness={nextExam.readiness}
              onPress={() =>
                router.push({ pathname: '/exam/[id]', params: { id: nextExam.id } })
              }
            />
          ) : null}

          {(weak.data ?? []).length > 0 ? (
            <Section title={t('home.weakAreas')} subtitle={t('home.weakAreasBody')}>
              <Card padded={false}>
                {(weak.data ?? []).map((concept, index) => (
                  <View
                    key={concept.id}
                    style={[styles.weakRow, index > 0 ? styles.weakDivider : null]}
                  >
                    <View style={styles.weakBody}>
                      <Text variant="body" numberOfLines={1}>
                        {concept.name}
                      </Text>
                      <MasteryMeter value={concept.mastery} compact />
                    </View>
                    <Button
                      label={t('cards.review')}
                      variant="ghost"
                      size="sm"
                      onPress={() =>
                        router.push({
                          pathname: '/review',
                          params: { spaceId: concept.space_id },
                        })
                      }
                    />
                  </View>
                ))}
              </Card>
            </Section>
          ) : null}

          <Section title={t('home.recentSpaces')}>
            <View style={styles.spaces}>
              {(spaces.data ?? []).map((item) => (
                <SpaceRow key={item.id} space={item} onPress={() => openSpace(item.id)} />
              ))}
            </View>
          </Section>
        </>
      )}
    </ScrollScreen>
  );
}

/* -------------------------------------------------------------------------- */

function Header({ streak }: { streak: number }) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? t('home.greetingMorning') : hour < 18 ? t('home.greetingAfternoon') : t('home.greetingEvening');

  return (
    <View style={styles.header}>
      <Text variant="title1">{greeting}</Text>
      {streak >= 2 ? (
        <View style={styles.streak}>
          <Icon name="sunrise" size={14} color="accent" />
          <Text variant="caption" color="accent">
            {t('home.streak', { count: streak })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The single most important element on the screen. Its content changes with
 * state so there is never a moment where the obvious next action is missing.
 */
function NextUp({
  totalDue,
  onReview,
  onCapture,
}: {
  totalDue: number;
  onReview: () => void;
  onCapture: () => void;
}) {
  const theme = useTheme();

  if (totalDue > 0) {
    return (
      <Card onPress={onReview} accessibilityLabel={t('home.reviewDue')} style={styles.primaryCard}>
        <View style={styles.primaryHeader}>
          <View style={[styles.primaryIcon, { backgroundColor: theme.colors.accentSurface }]}>
            <Icon name="layers" size={20} color="accent" />
          </View>
          <View style={styles.primaryBody}>
            <Text variant="title3">{t('home.reviewDue')}</Text>
            <Text variant="caption" color="textSecondary">
              {totalDue === 1
                ? t('home.reviewDueOne')
                : t('cards.due', { count: totalDue })}
            </Text>
          </View>
          <Icon name="arrow-right" size={20} color="accent" />
        </View>
      </Card>
    );
  }

  return (
    <Card style={styles.primaryCard}>
      <View style={styles.primaryHeader}>
        <View style={[styles.primaryIcon, { backgroundColor: theme.colors.successSurface }]}>
          <Icon name="check" size={20} color="success" />
        </View>
        <View style={styles.primaryBody}>
          <Text variant="title3">{t('home.allCaughtUp')}</Text>
          <Text variant="caption" color="textSecondary">
            {t('home.allCaughtUpBody')}
          </Text>
        </View>
      </View>
      <Button
        label={t('home.quickCapture')}
        variant="secondary"
        onPress={onCapture}
        style={styles.primaryAction}
      />
    </Card>
  );
}

function ProcessingCard({
  sources,
  onPress,
}: {
  sources: { id: string; title: string; progress: number; stage: string | null }[];
  onPress: (id: string) => void;
}) {
  const first = sources[0];
  if (!first) return null;

  return (
    <Card onPress={() => onPress(first.id)} style={styles.processing}>
      <View style={styles.processingHeader}>
        <Icon name="loader" size={16} color="accent" />
        <Text variant="captionStrong" color="accent" numberOfLines={1} style={styles.flex}>
          {t('home.processingNow', { title: first.title })}
        </Text>
        {sources.length > 1 ? <Badge label={`+${sources.length - 1}`} /> : null}
      </View>
      <ProgressBar value={first.progress / 100} label={t('processing.stillWorking')} />
      <Text variant="caption" color="textTertiary">
        {stageLabel(first.stage)}
      </Text>
    </Card>
  );
}

export function stageLabel(stage: string | null): string {
  switch (stage) {
    case 'upload': return t('processing.queued');
    case 'extract': return t('processing.reading');
    case 'transcribe': return t('processing.transcribing');
    case 'structure': return t('processing.structuring');
    case 'concepts': return t('processing.concepts');
    case 'materials': return t('processing.materials');
    case 'done': return t('processing.done');
    default: return t('processing.queued');
  }
}

function ExamCard({
  title,
  days,
  readiness,
  onPress,
}: {
  title: string;
  days: number;
  readiness: number;
  onPress: () => void;
}) {
  const when =
    days === 0 ? t('exam.today') : days === 1 ? t('exam.tomorrow') : t('exam.daysLeft', { count: days });

  return (
    <Card onPress={onPress} style={styles.exam}>
      <View style={styles.examHeader}>
        <Icon name="calendar" size={16} color="textSecondary" />
        <Text variant="captionStrong" color="textSecondary" numberOfLines={1} style={styles.flex}>
          {title}
        </Text>
        <Badge label={when} />
      </View>
      <View style={styles.examReadiness}>
        <Text variant="caption" color="textTertiary">
          {t('exam.readiness')}
        </Text>
        <MasteryMeter value={readiness} />
      </View>
    </Card>
  );
}

function SpaceRow({ space, onPress }: { space: SpaceSummary; onPress: () => void }) {
  const theme = useTheme();
  const accent = theme.spaceAccent(space.accent);

  return (
    <Card onPress={onPress} accessibilityLabel={space.name} style={styles.spaceCard}>
      <View style={styles.spaceRow}>
        <View style={[styles.spaceDot, { backgroundColor: accent }]} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {space.name}
          </Text>
          <Text variant="caption" color="textTertiary">
            {t('space.sourceCount', { count: space.sourceCount })}
          </Text>
        </View>
        {space.dueCount > 0 ? <Badge label={`${space.dueCount}`} tint={accent} /> : null}
        <Icon name="chevron-right" size={18} color="textTertiary" />
      </View>
    </Card>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="title3">{title}</Text>
        {subtitle ? (
          <Text variant="caption" color="textTertiary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function HomeSkeleton() {
  return (
    <View style={styles.skeleton}>
      <Skeleton height={96} radius={radius.lg} />
      <Skeleton width="45%" height={20} />
      <Skeleton height={72} radius={radius.lg} />
      <Skeleton height={72} radius={radius.lg} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.base,
    marginBottom: spacing.lg,
  },
  streak: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

  primaryCard: { marginBottom: spacing.base },
  primaryHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  primaryIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBody: { flex: 1, gap: 2 },
  primaryAction: { marginTop: spacing.base },

  processing: { marginBottom: spacing.base, gap: spacing.sm },
  processingHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },

  exam: { marginBottom: spacing.base, gap: spacing.md },
  examHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  examReadiness: { gap: spacing.xs },

  section: { marginTop: spacing.lg, gap: spacing.md },
  sectionHeader: { gap: 2 },

  weakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  weakDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#8883' },
  weakBody: { flex: 1, gap: spacing.xs },

  spaces: { gap: spacing.sm },
  spaceCard: { paddingVertical: spacing.md },
  spaceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  spaceDot: { width: 10, height: 10, borderRadius: 5 },

  skeleton: { gap: spacing.base },
});
