import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Banner,
  Button,
  Card,
  Field,
  Icon,
  ScrollScreen,
  Text,
} from '../../src/components';
import { ProcessingView } from '../../src/components/ProcessingView';
import { t } from '../../src/i18n';
import type { QuizMode } from '../../src/lib/api';
import { useAsyncAction } from '../../src/hooks/useAsyncAction';
import { track } from '../../src/services/analytics';
import { useGenerateQuiz } from '../../src/services/quizzes';
import { useSpaces } from '../../src/services/spaces';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius, space as spacing } from '../../src/theme/tokens';

type Option = { mode: QuizMode; count?: number; titleKey: string; bodyKey?: string; icon: 'zap' | 'target' | 'list' | 'award' | 'sliders' };

const OPTIONS: Option[] = [
  { mode: 'quick', count: 5, titleKey: 'quiz.quick', icon: 'zap' },
  { mode: 'standard', count: 10, titleKey: 'quiz.standard', icon: 'list' },
  { mode: 'long', count: 20, titleKey: 'quiz.long', icon: 'list' },
  { mode: 'weak_areas', count: 10, titleKey: 'quiz.weakAreas', bodyKey: 'quiz.weakAreasBody', icon: 'target' },
  { mode: 'exam_sim', count: 25, titleKey: 'quiz.examSim', bodyKey: 'quiz.examSimBody', icon: 'award' },
];

/**
 * Quiz setup.
 *
 * Length is the student's choice, up to 100 — arbitrary caps are one of the
 * loudest complaints about this category and there is no reason to inherit
 * them.
 */
export default function NewQuiz() {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams<{ spaceId?: string; sourceId?: string }>();

  const spaces = useSpaces();
  const generate = useGenerateQuiz();

  const [custom, setCustom] = useState('');
  const [customOpen, setCustomOpen] = useState(false);

  // Derived rather than synced into state: the first space is a fallback, not
  // a separate piece of state that could drift.
  const spaceId = params.spaceId ?? spaces.data?.[0]?.id;

  const start = useAsyncAction(async (mode: QuizMode, count?: number) => {
    if (!spaceId) throw new Error('Pick a study space first.');
    track('quiz_generated', { mode, count: count ?? 0 });

    const result = await generate.mutateAsync({
      spaceId,
      sourceId: params.sourceId ?? null,
      mode,
      count,
    });

    router.replace({ pathname: '/quiz/[id]', params: { id: result.quizSetId } });
  });

  if (start.loading) {
    return (
      <ScrollScreen>
        <ProcessingView
          kind="text"
          stage="materials"
          progress={70}
          title={t('quiz.generating')}
        />
      </ScrollScreen>
    );
  }

  const customCount = Number.parseInt(custom, 10);
  const customValid = Number.isFinite(customCount) && customCount >= 1 && customCount <= 100;

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
        <Text variant="title2">{t('quiz.title')}</Text>
      </View>

      {start.error ? <Banner tone="danger" title={start.error.message} style={styles.banner} /> : null}

      <View style={styles.list}>
        {OPTIONS.map((option) => (
          <Pressable
            key={option.mode}
            accessibilityRole="button"
            accessibilityLabel={t(option.titleKey as never)}
            onPress={() => void start.run(option.mode, option.count)}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View style={[styles.optionIcon, { backgroundColor: theme.colors.accentSurface }]}>
              <Icon name={option.icon} size={18} color="accent" />
            </View>
            <View style={styles.optionBody}>
              <Text variant="bodyStrong">{t(option.titleKey as never)}</Text>
              {option.bodyKey ? (
                <Text variant="caption" color="textSecondary">
                  {t(option.bodyKey as never)}
                </Text>
              ) : null}
            </View>
            <Icon name="chevron-right" size={18} color="textTertiary" />
          </Pressable>
        ))}

        {!customOpen ? (
          <Button
            label={t('quiz.custom')}
            variant="ghost"
            onPress={() => setCustomOpen(true)}
            style={styles.customToggle}
          />
        ) : (
          <Card style={styles.custom}>
            <Field
              label={t('quiz.questionCount')}
              value={custom}
              onChangeText={setCustom}
              keyboardType="number-pad"
              placeholder="30"
              autoFocus
              hint="1–100"
            />
            <Button
              label={t('quiz.start')}
              fullWidth
              disabled={!customValid}
              onPress={() => void start.run('custom', customCount)}
            />
          </Card>
        )}
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md, marginTop: spacing.base, marginBottom: spacing.lg },
  back: { alignSelf: 'flex-start', paddingHorizontal: 0, width: 40 },
  banner: { marginBottom: spacing.base },
  list: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    minHeight: 68,
  },
  optionIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBody: { flex: 1, gap: 2 },
  customToggle: { marginTop: spacing.sm },
  custom: { gap: spacing.base, marginTop: spacing.sm },
});
