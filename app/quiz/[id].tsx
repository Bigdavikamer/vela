import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, Button, Field, Icon, ProgressBar, Screen, Text } from '../../src/components';
import { t } from '../../src/i18n';
import { useAsyncAction } from '../../src/hooks/useAsyncAction';
import { track } from '../../src/services/analytics';
import {
  finishAttempt,
  startAttempt,
  submitAnswer,
  useQuiz,
  type AnswerValue,
  type GradedAnswer,
  type QuizQuestion,
} from '../../src/services/quizzes';
import { useReduceMotion, useTheme } from '../../src/theme/ThemeProvider';
import { motion, radius, space as spacing } from '../../src/theme/tokens';

/**
 * Running a quiz.
 *
 * Feedback is immediate and always explains — a wrong answer is the most
 * valuable moment in the whole product, and wasting it on a red X is the
 * difference between a quiz and a lesson.
 */
export default function QuizRunner() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { id } = useLocalSearchParams<{ id: string }>();

  const quiz = useQuiz(id);

  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<AnswerValue | null>(null);
  const [result, setResult] = useState<GradedAnswer | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const shownAt = useRef(0);

  const questions = quiz.data?.questions ?? [];
  const question: QuizQuestion | undefined = questions[index];
  const total = questions.length;

  // Start the attempt once the quiz has loaded.
  useEffect(() => {
    if (!id || attemptId || total === 0) return;
    void (async () => {
      const attempt = await startAttempt(id, total);
      setAttemptId(attempt.id);
      track('quiz_started', { count: total });
    })();
  }, [id, attemptId, total]);

  useEffect(() => {
    shownAt.current = Date.now();
    setAnswer(null);
    setResult(null);
  }, [index]);

  const check = useAsyncAction(async () => {
    if (!question || !attemptId || answer === null) return;
    const graded = await submitAnswer({
      question,
      attemptId,
      answer,
      durationMs: Date.now() - shownAt.current,
    });
    setResult(graded);
    if (graded.correct) setCorrectCount((n) => n + 1);
    Haptics.notificationAsync(
      graded.correct
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning,
    ).catch(() => {});
  });

  const next = useCallback(async () => {
    if (index + 1 < total) {
      setIndex((i) => i + 1);
      return;
    }
    if (attemptId) {
      await finishAttempt(attemptId);
      track('quiz_completed', { total, correct: correctCount });
      router.replace({ pathname: '/quiz/results/[attemptId]', params: { attemptId } });
    }
  }, [index, total, attemptId, correctCount, router]);

  if (quiz.isLoading) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text variant="callout" color="textTertiary">
            {t('common.loading')}
          </Text>
        </View>
      </Screen>
    );
  }

  if (!question) {
    return (
      <Screen>
        <Banner tone="danger" title={t('errors.notFound')} message={t('errors.notFoundBody')} />
      </Screen>
    );
  }

  const canSubmit = answer !== null && (typeof answer !== 'string' || answer.trim().length > 0);

  return (
    <Screen>
      <View style={styles.header}>
        <Button
          label=""
          variant="ghost"
          size="sm"
          accessibilityLabel={t('common.close')}
          icon={<Icon name="x" size={20} color="textSecondary" />}
          onPress={() => router.back()}
          style={styles.headerButton}
        />
        <ProgressBar
          value={index / Math.max(1, total)}
          height={4}
          label={t('quiz.questionOf', { current: index + 1, total })}
          style={styles.flex}
        />
        <Text variant="caption" color="textTertiary" style={styles.counter}>
          {index + 1}/{total}
        </Text>
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text variant="title3" style={styles.prompt}>
          {question.prompt}
        </Text>

        <AnswerInput
          question={question}
          answer={answer}
          onChange={setAnswer}
          locked={result !== null}
          result={result}
        />

        {check.error ? <Banner tone="danger" title={check.error.message} style={styles.feedback} /> : null}

        {result ? (
          <Animated.View
            entering={reduceMotion ? undefined : FadeIn.duration(motion.duration.base)}
            style={[
              styles.feedback,
              {
                backgroundColor: result.correct
                  ? theme.colors.successSurface
                  : theme.colors.dangerSurface,
              },
            ]}
          >
            <View style={styles.feedbackHeader}>
              <Icon
                name={result.correct ? 'check-circle' : 'x-circle'}
                size={18}
                color={result.correct ? 'success' : 'danger'}
              />
              <Text
                variant="bodyStrong"
                color={result.correct ? 'success' : 'danger'}
              >
                {result.correct ? t('quiz.correct') : t('quiz.incorrect')}
              </Text>
            </View>

            {result.note ? (
              <Text variant="callout" color="textSecondary">
                {result.note}
              </Text>
            ) : null}

            {result.explanation ? (
              <Text variant="callout" color="textSecondary">
                {result.explanation}
              </Text>
            ) : null}
          </Animated.View>
        ) : null}
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.base }]}>
        {result ? (
          <Button
            label={index + 1 < total ? t('common.next') : t('common.done')}
            size="lg"
            fullWidth
            onPress={() => void next()}
          />
        ) : (
          <Button
            label={t('quiz.submit')}
            size="lg"
            fullWidth
            disabled={!canSubmit}
            loading={check.loading}
            onPress={() => void check.run()}
          />
        )}
      </View>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */

function AnswerInput({
  question,
  answer,
  onChange,
  locked,
  result,
}: {
  question: QuizQuestion;
  answer: AnswerValue | null;
  onChange: (value: AnswerValue) => void;
  locked: boolean;
  result: GradedAnswer | null;
}) {
  const theme = useTheme();

  switch (question.type) {
    case 'multiple_choice': {
      const options = question.options as string[];
      const correctIndex = question.answer as number;

      return (
        <View style={styles.options} accessibilityRole="radiogroup">
          {options.map((option, i) => {
            const selected = answer === i;
            // After grading, show the right answer as well as what they chose.
            const showCorrect = locked && i === correctIndex;
            const showWrong = locked && selected && i !== correctIndex;

            return (
              <Pressable
                key={i}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: locked }}
                accessibilityLabel={option}
                disabled={locked}
                onPress={() => onChange(i)}
                style={({ pressed }) => [
                  styles.option,
                  {
                    backgroundColor: showCorrect
                      ? theme.colors.successSurface
                      : showWrong
                        ? theme.colors.dangerSurface
                        : selected
                          ? theme.colors.accentSurface
                          : theme.colors.surface,
                    borderColor: showCorrect
                      ? theme.colors.success
                      : showWrong
                        ? theme.colors.danger
                        : selected
                          ? theme.colors.accent
                          : theme.colors.border,
                    borderWidth: selected || showCorrect || showWrong ? 2 : StyleSheet.hairlineWidth * 2,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text variant="body" style={styles.flex}>
                  {option}
                </Text>
                {showCorrect ? <Icon name="check" size={16} color="success" /> : null}
                {showWrong ? <Icon name="x" size={16} color="danger" /> : null}
              </Pressable>
            );
          })}
        </View>
      );
    }

    case 'true_false': {
      const correct = question.answer as boolean;
      return (
        <View style={styles.trueFalse} accessibilityRole="radiogroup">
          {[true, false].map((value) => {
            const selected = answer === value;
            const showCorrect = locked && value === correct;
            const showWrong = locked && selected && value !== correct;

            return (
              <Pressable
                key={String(value)}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: locked }}
                accessibilityLabel={value ? t('quiz.trueLabel') : t('quiz.falseLabel')}
                disabled={locked}
                onPress={() => onChange(value)}
                style={({ pressed }) => [
                  styles.tfOption,
                  {
                    backgroundColor: showCorrect
                      ? theme.colors.successSurface
                      : showWrong
                        ? theme.colors.dangerSurface
                        : selected
                          ? theme.colors.accentSurface
                          : theme.colors.surface,
                    borderColor: selected || showCorrect ? theme.colors.accent : theme.colors.border,
                    borderWidth: selected || showCorrect || showWrong ? 2 : StyleSheet.hairlineWidth * 2,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text variant="bodyStrong">
                  {value ? t('quiz.trueLabel') : t('quiz.falseLabel')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      );
    }

    case 'short_answer':
      return (
        <View style={styles.shortAnswer}>
          <Field
            value={typeof answer === 'string' ? answer : ''}
            onChangeText={(value) => onChange(value)}
            placeholder={t('quiz.shortAnswerPlaceholder')}
            multiline
            multilineMinHeight={90}
            editable={!locked}
          />
          {locked && result && !result.correct ? (
            <View style={[styles.correctAnswer, { backgroundColor: theme.colors.successSurface }]}>
              <Text variant="micro" color="success" uppercase>
                {t('quiz.correctAnswer')}
              </Text>
              <Text variant="callout">{(question.answer as string[])[0]}</Text>
            </View>
          ) : null}
        </View>
      );

    case 'matching': {
      const { left, right } = question.options as { left: string[]; right: string[] };
      const pairs = (answer as number[][] | null) ?? [];

      return (
        <View style={styles.matching}>
          <Text variant="caption" color="textTertiary">
            Tap an item on the left, then its match on the right.
          </Text>
          <MatchingInput
            left={left}
            right={right}
            pairs={pairs}
            locked={locked}
            onChange={(nextPairs) => onChange(nextPairs)}
          />
        </View>
      );
    }
  }
}

function MatchingInput({
  left,
  right,
  pairs,
  locked,
  onChange,
}: {
  left: string[];
  right: string[];
  pairs: number[][];
  locked: boolean;
  onChange: (pairs: number[][]) => void;
}) {
  const theme = useTheme();
  const [activeLeft, setActiveLeft] = useState<number | null>(null);

  const pairFor = (leftIndex: number) => pairs.find(([l]) => l === leftIndex)?.[1];

  return (
    <View style={styles.matchingColumns}>
      <View style={styles.matchingColumn}>
        {left.map((item, i) => {
          const matched = pairFor(i);
          return (
            <Pressable
              key={i}
              disabled={locked}
              accessibilityRole="button"
              accessibilityState={{ selected: activeLeft === i }}
              accessibilityLabel={item}
              onPress={() => setActiveLeft(activeLeft === i ? null : i)}
              style={[
                styles.matchItem,
                {
                  backgroundColor: activeLeft === i ? theme.colors.accentSurface : theme.colors.surface,
                  borderColor: matched !== undefined ? theme.colors.accent : theme.colors.border,
                },
              ]}
            >
              <Text variant="caption" numberOfLines={2}>
                {item}
              </Text>
              {matched !== undefined ? (
                <Text variant="micro" color="accent">
                  → {matched + 1}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.matchingColumn}>
        {right.map((item, i) => (
          <Pressable
            key={i}
            disabled={locked || activeLeft === null}
            accessibilityRole="button"
            accessibilityLabel={`${i + 1}. ${item}`}
            onPress={() => {
              if (activeLeft === null) return;
              const without = pairs.filter(([l, r]) => l !== activeLeft && r !== i);
              onChange([...without, [activeLeft, i]]);
              setActiveLeft(null);
            }}
            style={[
              styles.matchItem,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                opacity: activeLeft === null && !locked ? 0.6 : 1,
              },
            ]}
          >
            <Text variant="micro" color="textTertiary">
              {i + 1}
            </Text>
            <Text variant="caption" numberOfLines={2}>
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
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
  counter: { minWidth: 44, textAlign: 'right' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingBottom: spacing.xl },
  prompt: { marginBottom: spacing.lg },

  options: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.md,
    minHeight: 56,
  },
  trueFalse: { flexDirection: 'row', gap: spacing.sm },
  tfOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    minHeight: 64,
  },
  shortAnswer: { gap: spacing.md },
  correctAnswer: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md },

  matching: { gap: spacing.md },
  matchingColumns: { flexDirection: 'row', gap: spacing.sm },
  matchingColumn: { flex: 1, gap: spacing.sm },
  matchItem: {
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth * 2,
    minHeight: 56,
    justifyContent: 'center',
    gap: 2,
  },

  feedback: { gap: spacing.sm, padding: spacing.base, borderRadius: radius.md, marginTop: spacing.lg },
  feedbackHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { gap: spacing.sm },
});
