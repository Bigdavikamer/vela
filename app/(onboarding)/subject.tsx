import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Banner, Chip, Field } from '../../src/components';
import { OnboardingStep } from '../../src/components/OnboardingStep';
import { t } from '../../src/i18n';
import { track } from '../../src/services/analytics';
import { useOnboarding } from '../../src/stores/onboarding';
import { space } from '../../src/theme/tokens';

/**
 * Step 1 — the only question we truly need.
 *
 * Suggestions exist because a blank field is the slowest possible start, and
 * because they quietly communicate what a "space" is.
 */
const SUGGESTIONS = [
  'Biology', 'Chemistry', 'Physics', 'Anatomy', 'Law',
  'Economics', 'History', 'Psychology', 'Calculus', 'Programming',
];

export default function SubjectStep() {
  const router = useRouter();
  const subject = useOnboarding((s) => s.subject);
  const setValue = useOnboarding((s) => s.set);
  const [error] = useState<string | null>(null);

  React.useEffect(() => {
    track('onboarding_started');
  }, []);

  const trimmed = subject.trim();

  return (
    <OnboardingStep
      step={1}
      totalSteps={4}
      title={t('onboarding.studyingTitle')}
      body={t('onboarding.studyingBody')}
      primaryLabel={t('common.continue')}
      primaryDisabled={trimmed.length === 0}
      onPrimary={() => router.push('/(onboarding)/goal')}
      canGoBack={false}
    >
      <View style={styles.container}>
        {error ? <Banner tone="danger" title={error} /> : null}

        <Field
          value={subject}
          onChangeText={(value) => setValue('subject', value)}
          placeholder={t('onboarding.studyingPlaceholder')}
          autoFocus
          autoCapitalize="sentences"
          returnKeyType="done"
          maxLength={120}
          onSubmitEditing={() => {
            if (trimmed.length > 0) router.push('/(onboarding)/goal');
          }}
        />

        <View style={styles.suggestions}>
          {SUGGESTIONS.map((suggestion) => (
            <Chip
              key={suggestion}
              label={suggestion}
              selected={trimmed.toLowerCase() === suggestion.toLowerCase()}
              onPress={() => setValue('subject', suggestion)}
            />
          ))}
        </View>
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.lg },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
