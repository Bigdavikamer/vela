import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, EmptyState, Icon, MasteryMeter, ScrollScreen, Text } from '../../src/components';
import { t } from '../../src/i18n';
import { daysUntil, useExams } from '../../src/services/exams';
import { useSpaces } from '../../src/services/spaces';
import { space as spacing } from '../../src/theme/tokens';

export default function ExamList() {
  const router = useRouter();
  const exams = useExams();
  const spaces = useSpaces();

  const hasSpaces = (spaces.data?.length ?? 0) > 0;

  return (
    <ScrollScreen>
      <View style={styles.header}>
        <Button
          label=""
          variant="ghost"
          size="sm"
          accessibilityLabel={t('common.back')}
          icon={<Icon name="arrow-left" size={20} color="textSecondary" />}
          onPress={() => router.back()}
          style={styles.back}
        />
        <Text variant="title2">{t('exam.title')}</Text>
      </View>

      {(exams.data ?? []).length === 0 ? (
        <EmptyState
          icon="calendar"
          title={t('exam.noPlan')}
          body={t('exam.noPlanBody')}
          actionLabel={hasSpaces ? t('exam.addExam') : undefined}
          onAction={hasSpaces ? () => router.push('/exam/new') : undefined}
        />
      ) : (
        <View style={styles.list}>
          {(exams.data ?? []).map((exam) => {
            const days = daysUntil(exam.exam_date);
            return (
              <Card
                key={exam.id}
                onPress={() => router.push({ pathname: '/exam/[id]', params: { id: exam.id } })}
                style={styles.card}
              >
                <View style={styles.cardHeader}>
                  <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
                    {exam.title}
                  </Text>
                  <Badge
                    label={
                      days === 0
                        ? t('exam.today')
                        : days === 1
                          ? t('exam.tomorrow')
                          : t('exam.daysLeft', { count: days })
                    }
                  />
                </View>
                <MasteryMeter value={exam.readiness} label={t('exam.readiness')} />
              </Card>
            );
          })}

          <Button
            label={t('exam.addExam')}
            variant="secondary"
            fullWidth
            icon={<Icon name="plus" size={16} color="text" />}
            onPress={() => router.push('/exam/new')}
            style={styles.add}
          />
        </View>
      )}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: spacing.md, marginTop: spacing.base, marginBottom: spacing.lg },
  back: { alignSelf: 'flex-start', paddingHorizontal: 0, width: 40 },
  list: { gap: spacing.sm },
  card: { gap: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  add: { marginTop: spacing.sm },
});
