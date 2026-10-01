import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceCard, OnboardingStep } from '../../src/components/OnboardingStep';
import { t } from '../../src/i18n';
import { useOnboarding, type StudyGoal } from '../../src/stores/onboarding';
import { space } from '../../src/theme/tokens';

/**
 * Step 2 — what would help most.
 *
 * This is asked because it changes the product, not to make onboarding feel
 * personal: it decides what Home puts first, and whether we offer to set up an
 * exam next.
 */
const GOALS: { value: StudyGoal; labelKey: string; bodyKey: string }[] = [
  { value: 'keep_up', labelKey: 'onboarding.goalKeepUp', bodyKey: 'onboarding.goalKeepUpBody' },
  { value: 'exam', labelKey: 'onboarding.goalExam', bodyKey: 'onboarding.goalExamBody' },
  { value: 'understand', labelKey: 'onboarding.goalUnderstand', bodyKey: 'onboarding.goalUnderstandBody' },
  { value: 'remember', labelKey: 'onboarding.goalRemember', bodyKey: 'onboarding.goalRememberBody' },
];

export default function GoalStep() {
  const router = useRouter();
  const goal = useOnboarding((s) => s.goal);
  const setValue = useOnboarding((s) => s.set);

  return (
    <OnboardingStep
      step={2}
      totalSteps={4}
      title={t('onboarding.goalTitle')}
      body={t('onboarding.goalBody')}
      primaryLabel={t('common.continue')}
      primaryDisabled={!goal}
      onPrimary={() => router.push('/(onboarding)/style')}
    >
      <View style={styles.list} accessibilityRole="radiogroup">
        {GOALS.map((option) => (
          <ChoiceCard
            key={option.value}
            label={t(option.labelKey as never)}
            description={t(option.bodyKey as never)}
            selected={goal === option.value}
            onPress={() => setValue('goal', option.value)}
          />
        ))}
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.md },
});
