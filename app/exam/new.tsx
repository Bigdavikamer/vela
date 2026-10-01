import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Banner, Button, Field, Icon, ScrollScreen, Text } from '../../src/components';
import { t } from '../../src/i18n';
import { useAsyncAction } from '../../src/hooks/useAsyncAction';
import { track } from '../../src/services/analytics';
import { todayIso, useBuildPlan, useCreateExam } from '../../src/services/exams';
import { useSpaces } from '../../src/services/spaces';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius, space as spacing } from '../../src/theme/tokens';

/**
 * Creating an exam.
 *
 * Dates are offered as relative choices ("in 2 weeks") rather than a calendar
 * widget, because that is how students actually know the date, and it keeps
 * this to two taps. An exact date is still available.
 */
const QUICK_DATES = [3, 7, 14, 21, 30];

export default function NewExam() {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams<{ spaceId?: string }>();

  const spaces = useSpaces();
  const createExam = useCreateExam();
  const buildPlan = useBuildPlan();

  const [title, setTitle] = useState('');
  const [offset, setOffset] = useState<number | null>(7);
  const [exactDate, setExactDate] = useState('');

  // Derived rather than synced into state.
  const spaceId = params.spaceId ?? spaces.data?.[0]?.id;

  const examDate = useMemo(() => {
    if (offset === null) return exactDate;
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  }, [offset, exactDate]);

  const valid =
    title.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(examDate) &&
    examDate >= todayIso() &&
    Boolean(spaceId);

  const submit = useAsyncAction(async () => {
    if (!spaceId) throw new Error('Pick a study space first.');

    const exam = await createExam.mutateAsync({
      spaceId,
      title: title.trim(),
      examDate,
    });
    track('exam_created');

    // Build the plan immediately — an exam with no plan is just a date.
    await buildPlan.mutateAsync(exam.id).catch(() => undefined);

    router.replace({ pathname: '/exam/[id]', params: { id: exam.id } });
  });

  return (
    <ScrollScreen keyboardAware>
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
        <Text variant="title2">{t('exam.addExam')}</Text>
      </View>

      {submit.error ? <Banner tone="danger" title={submit.error.message} style={styles.banner} /> : null}

      <View style={styles.form}>
        <Field
          label={t('exam.examTitle')}
          value={title}
          onChangeText={setTitle}
          placeholder={t('onboarding.examNamePlaceholder')}
          autoFocus
          maxLength={120}
        />

        <View style={styles.section}>
          <Text variant="captionStrong" color="textSecondary">
            {t('exam.examDate')}
          </Text>
          <View style={styles.dates}>
            {QUICK_DATES.map((days) => (
              <Pressable
                key={days}
                accessibilityRole="radio"
                accessibilityState={{ selected: offset === days }}
                accessibilityLabel={t('exam.daysLeft', { count: days })}
                onPress={() => setOffset(days)}
                style={[
                  styles.date,
                  {
                    backgroundColor: offset === days ? theme.colors.accentSurface : theme.colors.fill,
                    borderColor: offset === days ? theme.colors.accent : 'transparent',
                    borderWidth: offset === days ? 1.5 : 0,
                  },
                ]}
              >
                <Text variant="bodyStrong" color={offset === days ? 'accent' : 'text'}>
                  {days}
                </Text>
                <Text variant="micro" color="textTertiary">
                  days
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => setOffset(offset === null ? 7 : null)}
            style={styles.exactToggle}
          >
            <Icon name={offset === null ? 'check-square' : 'square'} size={16} color="textSecondary" />
            <Text variant="caption" color="textSecondary">
              Pick an exact date
            </Text>
          </Pressable>

          {offset === null ? (
            <Field
              value={exactDate}
              onChangeText={setExactDate}
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              hint={examDate && examDate < todayIso() ? 'That date has passed.' : undefined}
            />
          ) : (
            <Text variant="caption" color="textTertiary">
              {new Date(`${examDate}T00:00:00`).toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </Text>
          )}
        </View>

        <Button
          label={t('common.continue')}
          size="lg"
          fullWidth
          disabled={!valid}
          loading={submit.loading}
          onPress={() => void submit.run()}
        />
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md, marginTop: spacing.base, marginBottom: spacing.lg },
  back: { alignSelf: 'flex-start', paddingHorizontal: 0, width: 40 },
  banner: { marginBottom: spacing.base },
  form: { gap: spacing.lg },
  section: { gap: spacing.md },
  dates: { flexDirection: 'row', gap: spacing.sm },
  date: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    minHeight: 56,
  },
  exactToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
});
