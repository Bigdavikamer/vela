import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '../../src/components';
import { ChoiceCard, OnboardingStep } from '../../src/components/OnboardingStep';
import { SUPPORTED_LOCALES, t } from '../../src/i18n';
import { useOnboarding, type StudyStyle } from '../../src/stores/onboarding';
import { space } from '../../src/theme/tokens';

const STYLES: { value: StudyStyle; labelKey: string; bodyKey: string }[] = [
  { value: 'recall_first', labelKey: 'onboarding.styleRecall', bodyKey: 'onboarding.styleRecallBody' },
  { value: 'explain_first', labelKey: 'onboarding.styleExplain', bodyKey: 'onboarding.styleExplainBody' },
  { value: 'practice_heavy', labelKey: 'onboarding.stylePractice', bodyKey: 'onboarding.stylePracticeBody' },
  { value: 'skim_then_drill', labelKey: 'onboarding.styleSkim', bodyKey: 'onboarding.styleSkimBody' },
];

/**
 * Step 3 — study style and, crucially, content language.
 *
 * The language question is here rather than buried in settings because getting
 * it wrong is the single most-reported failure in this product category:
 * material silently coming back translated. The default is "match the source",
 * and it is presented as the recommendation.
 */
export default function StyleStep() {
  const router = useRouter();
  const style = useOnboarding((s) => s.style);
  const contentLanguage = useOnboarding((s) => s.contentLanguage);
  const setValue = useOnboarding((s) => s.set);

  return (
    <OnboardingStep
      step={3}
      totalSteps={4}
      title={t('onboarding.styleTitle')}
      body={t('onboarding.styleBody')}
      primaryLabel={t('common.continue')}
      primaryDisabled={!style}
      onPrimary={() => router.push('/(onboarding)/ready')}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.list} accessibilityRole="radiogroup">
          {STYLES.map((option) => (
            <ChoiceCard
              key={option.value}
              label={t(option.labelKey as never)}
              description={t(option.bodyKey as never)}
              selected={style === option.value}
              onPress={() => setValue('style', option.value)}
            />
          ))}
        </View>

        <View style={styles.section}>
          <Text variant="title3">{t('onboarding.languageTitle')}</Text>
          <Text variant="caption" color="textSecondary">
            {t('onboarding.languageBody')}
          </Text>
        </View>

        <View style={styles.list} accessibilityRole="radiogroup">
          <ChoiceCard
            label={t('onboarding.languageMatch')}
            description={t('onboarding.languageMatchBody')}
            selected={contentLanguage === null}
            onPress={() => setValue('contentLanguage', null)}
          />
          {SUPPORTED_LOCALES.map((locale) => (
            <ChoiceCard
              key={locale.code}
              label={locale.label}
              selected={contentLanguage === locale.code}
              onPress={() => setValue('contentLanguage', locale.code)}
            />
          ))}
        </View>
      </ScrollView>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: space.xl },
  list: { gap: space.md },
  section: { gap: space.xs, marginTop: space.xxl, marginBottom: space.base },
});
