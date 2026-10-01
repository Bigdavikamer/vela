import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  Icon,
  ProgressRing,
  ScrollScreen,
  Text,
} from '../../src/components';
import { t } from '../../src/i18n';
import { useAsyncAction } from '../../src/hooks/useAsyncAction';
import { track } from '../../src/services/analytics';
import {
  daysUntil,
  todayIso,
  useBuildPlan,
  useCompletePlanItem,
  useExam,
  useExamPlan,
  type PlanItem,
} from '../../src/services/exams';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius, space as spacing } from '../../src/theme/tokens';

/**
 * Exam preparation.
 *
 * Readiness is derived from measured mastery weighted by concept importance,
 * and it is labelled as study guidance every time it appears. Vela does not
 * predict grades and must never imply that it does.
 */
export default function ExamScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const exam = useExam(id);
  const plan = useExamPlan(id);
  const buildPlan = useBuildPlan();
  const complete = useCompletePlanItem();

  const build = useAsyncAction(async () => {
    if (!id) return;
    await buildPlan.mutateAsync(id);
    track('exam_plan_generated');
  });

  const days = exam.data ? daysUntil(exam.data.exam_date) : 0;
  const today = todayIso();

  const { todayItems, upcoming } = useMemo(() => {
    const items = plan.data ?? [];
    return {
      todayItems: items.filter((i) => i.scheduled_for <= today && !i.completed_at),
      upcoming: items.filter((i) => i.scheduled_for > today && !i.completed_at),
    };
  }, [plan.data, today]);

  if (!exam.data) {
    return (
      <ScrollScreen>
        <Header onBack={() => router.back()} title="" />
        {exam.isLoading ? null : (
          <Banner tone="danger" title={t('errors.notFound')} message={t('errors.notFoundBody')} />
        )}
      </ScrollScreen>
    );
  }

  const readinessTone =
    exam.data.readiness >= 0.7
      ? theme.colors.success
      : exam.data.readiness >= 0.4
        ? theme.colors.warning
        : theme.colors.danger;

  return (
    <ScrollScreen>
      <Header onBack={() => router.back()} title={exam.data.title} />

      <View style={styles.hero}>
        <ProgressRing
          value={exam.data.readiness}
          size={120}
          strokeWidth={9}
          tint={readinessTone}
          label={t('exam.readiness')}
        >
          <Text variant="title1" tint={readinessTone}>
            {Math.round(exam.data.readiness * 100)}%
          </Text>
        </ProgressRing>

        <Badge
          label={
            days === 0
              ? t('exam.today')
              : days === 1
                ? t('exam.tomorrow')
                : t('exam.daysLeft', { count: days })
          }
        />

        <Text variant="caption" color="textSecondary" align="center">
          {t('exam.readinessBody')}
        </Text>

        {/* Stated plainly, every time, right under the number. */}
        <Text variant="micro" color="textTertiary" align="center" style={styles.disclaimer}>
          {t('exam.readinessDisclaimer')}
        </Text>
      </View>

      {build.error ? <Banner tone="danger" title={build.error.message} style={styles.banner} /> : null}

      {(plan.data ?? []).length === 0 ? (
        <EmptyState
          icon="calendar"
          title={t('exam.noPlan')}
          body={t('exam.noPlanBody')}
          actionLabel={t('exam.plan')}
          onAction={() => void build.run()}
        />
      ) : (
        <>
          {todayItems.length > 0 ? (
            <Section title={t('exam.todaysWork')}>
              {todayItems.map((item) => (
                <PlanRow
                  key={item.id}
                  item={item}
                  onComplete={() => void complete.mutateAsync({ itemId: item.id, examId: id! })}
                  onStart={() => startItem(item, exam.data!.space_id, router)}
                />
              ))}
            </Section>
          ) : (
            <Banner
              tone="success"
              title={t('home.allCaughtUp')}
              message={t('home.allCaughtUpBody')}
              style={styles.banner}
            />
          )}

          {upcoming.length > 0 ? (
            <Section title={t('exam.plan')}>
              {upcoming.slice(0, 12).map((item) => (
                <PlanRow
                  key={item.id}
                  item={item}
                  muted
                  onComplete={() => void complete.mutateAsync({ itemId: item.id, examId: id! })}
                  onStart={() => startItem(item, exam.data!.space_id, router)}
                />
              ))}
            </Section>
          ) : null}

          <Button
            label={t('exam.regeneratePlan')}
            variant="ghost"
            loading={build.loading}
            onPress={() => void build.run()}
            style={styles.rebuild}
          />
        </>
      )}
    </ScrollScreen>
  );
}

function startItem(
  item: PlanItem,
  spaceId: string,
  router: ReturnType<typeof useRouter>,
) {
  switch (item.kind) {
    case 'quiz':
      router.push({
        pathname: '/quiz/new',
        params: { spaceId },
      });
      break;
    case 'flashcards':
    case 'review':
    case 'drill':
      router.push({ pathname: '/review', params: { spaceId } });
      break;
    default:
      router.push({ pathname: '/space/[id]', params: { id: spaceId } });
  }
}

function PlanRow({
  item,
  onComplete,
  onStart,
  muted,
}: {
  item: PlanItem;
  onComplete: () => void;
  onStart: () => void;
  muted?: boolean;
}) {
  const theme = useTheme();

  return (
    <Card style={[styles.planCard, muted ? styles.muted : null]}>
      <View style={styles.planRow}>
        <View style={[styles.planIcon, { backgroundColor: theme.colors.accentSurface }]}>
          <Icon name={iconFor(item.kind)} size={16} color="accent" />
        </View>
        <View style={styles.planBody}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {item.title}
          </Text>
          <Text variant="caption" color="textTertiary">
            {t('common.minutes', { count: item.estimated_minutes })} ·{' '}
            {new Date(`${item.scheduled_for}T00:00:00`).toLocaleDateString(undefined, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}
          </Text>
        </View>
      </View>

      <View style={styles.planActions}>
        <Button label={t('common.continue')} size="sm" onPress={onStart} />
        <Button label={t('exam.markDone')} variant="ghost" size="sm" onPress={onComplete} />
      </View>
    </Card>
  );
}

function iconFor(kind: PlanItem['kind']) {
  switch (kind) {
    case 'quiz': return 'help-circle' as const;
    case 'flashcards': return 'layers' as const;
    case 'read': return 'book-open' as const;
    case 'drill': return 'target' as const;
    default: return 'refresh-cw' as const;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="title3">{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Header({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <View style={styles.header}>
      <Button
        label=""
        variant="ghost"
        size="sm"
        accessibilityLabel={t('common.back')}
        icon={<Icon name="arrow-left" size={20} color="textSecondary" />}
        onPress={onBack}
        style={styles.headerButton}
      />
      <Text variant="captionStrong" color="textSecondary" numberOfLines={1} style={styles.flex}>
        {title}
      </Text>
      <View style={styles.headerButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  headerButton: { width: 40, paddingHorizontal: 0 },
  hero: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  disclaimer: { maxWidth: 300 },
  banner: { marginBottom: spacing.base },
  section: { gap: spacing.md, marginBottom: spacing.lg },
  sectionBody: { gap: spacing.sm },
  planCard: { gap: spacing.md },
  muted: { opacity: 0.7 },
  planRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  planIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planBody: { flex: 1, gap: 2 },
  planActions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' },
  rebuild: { marginTop: spacing.sm },
});
