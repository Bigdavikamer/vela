import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Banner, Card, Icon, Text } from '../../src/components';
import { OnboardingStep } from '../../src/components/OnboardingStep';
import { t } from '../../src/i18n';
import { useAsyncAction } from '../../src/hooks/useAsyncAction';
import { track } from '../../src/services/analytics';
import { completeOnboarding } from '../../src/services/auth';
import { pickAccent } from '../../src/services/spaces';
import { supabase, unwrap } from '../../src/lib/supabase';
import { usePreferences } from '../../src/stores/preferences';
import { useOnboarding } from '../../src/stores/onboarding';
import { useTheme } from '../../src/theme/ThemeProvider';
import { space as spacing } from '../../src/theme/tokens';

/**
 * Final step — create the space and hand the student straight to capture.
 *
 * Onboarding ends at the moment of value, not at a "You're all set!" screen:
 * the next tap adds real material.
 */
export default function ReadyStep() {
  const router = useRouter();
  const theme = useTheme();
  const onboarding = useOnboarding();
  const setPreference = usePreferences((s) => s.set);

  const finish = useAsyncAction(async (goToCapture: boolean) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not signed in');

    // Create the space at most once. Two guards, because this screen can be
    // reached again after a failure and the in-memory one does not survive that:
    //   1. the id we stored on a previous run of this screen
    //   2. an existing space with the same name, which is what actually caught
    //      the duplicates when the route guard was bouncing users back here
    const name = onboarding.subject.trim();
    let spaceId = onboarding.spaceId;

    if (!spaceId) {
      const existing = unwrap(
        await supabase
          .from('study_spaces')
          .select('id')
          .eq('user_id', userData.user.id)
          .eq('name', name)
          .is('archived_at', null)
          .limit(1),
      ) as { id: string }[];
      spaceId = existing[0]?.id;
    }

    if (!spaceId) {
      const created = unwrap(
        await supabase
          .from('study_spaces')
          .insert({
            user_id: userData.user.id,
            name,
            accent: pickAccent(name),
            last_opened_at: new Date().toISOString(),
          })
          .select('id')
          .single(),
      ) as { id: string };

      spaceId = created.id;
      track('space_created', { during_onboarding: true });
    }

    onboarding.set('spaceId', spaceId);

    if (onboarding.contentLanguage !== undefined) {
      setPreference('contentLanguage', onboarding.contentLanguage);
    }

    await completeOnboarding({
      studyStyle: onboarding.style,
      contentLanguage: onboarding.contentLanguage,
    });

    // Navigate first, clear the wizard state second. Resetting beforehand blanked
    // the subject for a frame and threw away the spaceId the retry path needs.
    if (goToCapture) {
      router.replace({ pathname: '/capture', params: { spaceId } });
    } else {
      router.replace('/(tabs)');
    }

    onboarding.reset();
  });

  return (
    <OnboardingStep
      step={4}
      totalSteps={4}
      title={t('onboarding.firstCaptureTitle')}
      body={t('onboarding.firstCaptureBody')}
      primaryLabel={t('capture.title')}
      primaryLoading={finish.loading}
      onPrimary={() => void finish.run(true)}
      secondaryLabel={t('common.skip')}
      onSecondary={() => void finish.run(false)}
    >
      <View style={styles.container}>
        {finish.error ? <Banner tone="danger" title={finish.error.message} /> : null}

        {/* Shows what will happen to whatever they add — the pipeline made
            concrete, before they have any material in the app. */}
        <Card>
          <View style={styles.space}>
            <View style={[styles.dot, { backgroundColor: theme.spaceAccent(pickAccent(onboarding.subject)) }]} />
            <Text variant="bodyStrong" numberOfLines={1}>
              {onboarding.subject.trim()}
            </Text>
          </View>

          <View style={styles.steps}>
            {[
              { icon: 'file-text' as const, label: t('note.studyGuide') },
              { icon: 'layers' as const, label: t('cards.title') },
              { icon: 'help-circle' as const, label: t('quiz.title') },
              { icon: 'message-circle' as const, label: t('tutor.title') },
            ].map((item) => (
              <View key={item.label} style={styles.step}>
                <View style={[styles.stepIcon, { backgroundColor: theme.colors.accentSurface }]}>
                  <Icon name={item.icon} size={15} color="accent" />
                </View>
                <Text variant="caption" color="textSecondary">
                  {item.label}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  space: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  steps: { marginTop: spacing.base, gap: spacing.md },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
