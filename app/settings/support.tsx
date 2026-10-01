import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Banner, Button, Field, Icon, ScrollScreen, Text } from '../../src/components';
import { ChoiceCard } from '../../src/components/OnboardingStep';
import { t } from '../../src/i18n';
import { useAsyncAction } from '../../src/hooks/useAsyncAction';
import { sendFeedback } from '../../src/services/analytics';
import { space as spacing } from '../../src/theme/tokens';

type Kind = 'ai_quality' | 'transcription' | 'billing' | 'bug' | 'other';

const KINDS: { value: Kind; labelKey: string }[] = [
  { value: 'ai_quality', labelKey: 'settings.reportAiQuality' },
  { value: 'transcription', labelKey: 'settings.reportTranscription' },
  { value: 'billing', labelKey: 'settings.reportBilling' },
  { value: 'bug', labelKey: 'settings.reportBug' },
];

/**
 * Support.
 *
 * The report carries the technical context needed to reproduce a problem —
 * platform, version, and the kind of failure — and nothing from the student's
 * material. That constraint is stated on the screen, not just honoured quietly.
 */
export default function Support() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(null);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const submit = useAsyncAction(async () => {
    if (!kind) return;
    await sendFeedback({ kind, message });
    setSent(true);
  });

  if (sent) {
    return (
      <ScrollScreen>
        <View style={styles.done}>
          <Icon name="check-circle" size={28} color="success" />
          <Text variant="title3" align="center">
            {t('settings.reportSent')}
          </Text>
          <Text variant="callout" color="textSecondary" align="center">
            {t('settings.reportSentBody')}
          </Text>
          <Button
            label={t('common.done')}
            onPress={() => router.back()}
            style={styles.doneAction}
          />
        </View>
      </ScrollScreen>
    );
  }

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
        <Text variant="title2">{t('settings.reportProblem')}</Text>
      </View>

      {submit.error ? <Banner tone="danger" title={submit.error.message} style={styles.banner} /> : null}

      <View style={styles.list} accessibilityRole="radiogroup">
        {KINDS.map((option) => (
          <ChoiceCard
            key={option.value}
            label={t(option.labelKey as never)}
            selected={kind === option.value}
            onPress={() => setKind(option.value)}
          />
        ))}
      </View>

      <View style={styles.form}>
        <Field
          value={message}
          onChangeText={setMessage}
          placeholder={t('settings.reportPlaceholder')}
          multiline
          multilineMinHeight={140}
        />

        <Text variant="caption" color="textTertiary">
          {t('settings.reportSentBody')}
        </Text>

        <Button
          label={t('common.continue')}
          size="lg"
          fullWidth
          disabled={!kind || message.trim().length < 10}
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
  list: { gap: spacing.sm, marginBottom: spacing.lg },
  form: { gap: spacing.base },
  done: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.giant },
  doneAction: { marginTop: spacing.base, minWidth: 200 },
});
