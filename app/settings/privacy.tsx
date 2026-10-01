import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Banner, Button, Card, Field, Icon, ScrollScreen, Sheet, Text, ToggleRow } from '../../src/components';
import { t } from '../../src/i18n';
import { useAsyncAction } from '../../src/hooks/useAsyncAction';
import { deleteAccount } from '../../src/services/auth';
import { usePreferences } from '../../src/stores/preferences';
import { space as spacing } from '../../src/theme/tokens';

/**
 * Privacy and data.
 *
 * Says exactly what Vela stores, in plain language, and puts the two controls
 * that matter — analytics opt-out and account deletion — on the same screen as
 * the explanation rather than in a policy nobody reads.
 */
export default function Privacy() {
  const router = useRouter();
  const analyticsOptOut = usePreferences((s) => s.analyticsOptOut);
  const setPreference = usePreferences((s) => s.set);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const remove = useAsyncAction(async () => {
    await deleteAccount();
    router.replace('/(auth)/welcome');
  });

  const FACTS = [
    {
      icon: 'upload-cloud' as const,
      title: 'What gets uploaded',
      body: 'Only material you explicitly add: recordings you make, files you choose, text you paste, and links you give. Nothing is collected in the background.',
    },
    {
      icon: 'cpu' as const,
      title: 'What gets processed',
      body: 'Your material is sent to the AI service that generates your notes, cards, and answers. Audio is additionally sent to a speech-to-text service for transcription.',
    },
    {
      icon: 'lock' as const,
      title: 'What gets stored',
      body: 'Your files sit in private storage that only your account can read, reached through short-lived signed links. Notes, cards, and progress are protected by row-level security in the database.',
    },
    {
      icon: 'eye-off' as const,
      title: 'What we never collect',
      body: 'Usage analytics record which features you used and when — never the content of your material, your questions, or your notes.',
    },
  ];

  return (
    <>
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
          <Text variant="title2">{t('settings.privacy')}</Text>
        </View>

        <View style={styles.facts}>
          {FACTS.map((fact) => (
            <Card key={fact.title} style={styles.fact}>
              <View style={styles.factHeader}>
                <Icon name={fact.icon} size={16} color="accent" />
                <Text variant="bodyStrong" style={styles.flex}>
                  {fact.title}
                </Text>
              </View>
              <Text variant="callout" color="textSecondary">
                {fact.body}
              </Text>
            </Card>
          ))}
        </View>

        <Card style={styles.control}>
          <ToggleRow
            label={t('settings.analyticsOptOut')}
            description={t('settings.analyticsOptOutBody')}
            value={analyticsOptOut}
            onChange={(value) => setPreference('analyticsOptOut', value)}
          />
        </Card>

        <View style={styles.danger}>
          <Text variant="captionStrong" color="textTertiary" uppercase>
            {t('settings.deleteAccount')}
          </Text>
          <Text variant="caption" color="textSecondary">
            {t('settings.deleteAccountBody')}
          </Text>
          <Button
            label={t('settings.deleteAccount')}
            variant="danger"
            fullWidth
            onPress={() => setConfirmOpen(true)}
          />
        </View>
      </ScrollScreen>

      <Sheet
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('settings.deleteAccountConfirm')}
        // Not swipe-dismissible: this one should take a deliberate tap.
        dismissible={false}
      >
        <View style={styles.sheet}>
          <Text variant="callout" color="textSecondary">
            {t('settings.deleteAccountBody')}
          </Text>

          {remove.error ? <Banner tone="danger" title={remove.error.message} /> : null}

          {/* Typing the word is the friction that stops an accidental tap from
              destroying a semester of work. */}
          <Field
            label={t('settings.deleteAccountConfirmWord')}
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          <Button
            label={t('common.delete')}
            variant="danger"
            fullWidth
            disabled={confirmText.trim().toUpperCase() !== 'DELETE'}
            loading={remove.loading}
            onPress={() => void remove.run()}
          />
          <Button
            label={t('common.cancel')}
            variant="ghost"
            fullWidth
            onPress={() => {
              setConfirmOpen(false);
              setConfirmText('');
            }}
          />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: spacing.md, marginTop: spacing.base, marginBottom: spacing.lg },
  back: { alignSelf: 'flex-start', paddingHorizontal: 0, width: 40 },
  facts: { gap: spacing.sm },
  fact: { gap: spacing.sm },
  factHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  control: { marginTop: spacing.lg, paddingVertical: 0 },
  danger: { gap: spacing.sm, marginTop: spacing.xxl },
  sheet: { gap: spacing.md, paddingBottom: spacing.base },
});
