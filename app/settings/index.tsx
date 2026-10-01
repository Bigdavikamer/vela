import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Banner,
  Button,
  Card,
  Icon,
  ListRow,
  ScrollScreen,
  Segmented,
  Sheet,
  Text,
  ToggleRow,
} from '../../src/components';
import { SUPPORTED_LOCALES, t, type LocaleCode } from '../../src/i18n';
import { useAsyncAction } from '../../src/hooks/useAsyncAction';
import { signOut } from '../../src/services/auth';
import { usePreferences } from '../../src/stores/preferences';
import { config } from '../../src/lib/config';
import { space as spacing } from '../../src/theme/tokens';

/**
 * Settings.
 *
 * Every control here changes something real and takes effect immediately. The
 * accessibility group is first-class rather than buried, and the content
 * language control repeats the "match the source" default so it is impossible
 * to be surprised by a translation.
 */
export default function Settings() {
  const router = useRouter();
  const prefs = usePreferences();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [contentLanguageOpen, setContentLanguageOpen] = useState(false);

  const signOutAction = useAsyncAction(async () => {
    await signOut();
    router.replace('/(auth)/welcome');
  });

  const currentLocale = SUPPORTED_LOCALES.find((l) => l.code === prefs.uiLocale);
  const currentContent = prefs.contentLanguage
    ? SUPPORTED_LOCALES.find((l) => l.code === prefs.contentLanguage)?.label ?? prefs.contentLanguage
    : t('onboarding.languageMatch');

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
          <Text variant="title2">{t('settings.title')}</Text>
        </View>

        {signOutAction.error ? (
          <Banner tone="danger" title={signOutAction.error.message} style={styles.banner} />
        ) : null}

        <Group title={t('settings.appearance')}>
          <View style={styles.control}>
            <Segmented
              options={[
                { value: 'system', label: t('settings.themeSystem') },
                { value: 'light', label: t('settings.themeLight') },
                { value: 'dark', label: t('settings.themeDark') },
              ]}
              value={prefs.theme}
              onChange={(value) => prefs.set('theme', value)}
            />
          </View>

          <View style={styles.control}>
            <Text variant="captionStrong" color="textSecondary">
              {t('settings.textSize')}
            </Text>
            <Segmented
              options={[
                { value: '0.9', label: 'A' },
                { value: '1', label: 'A' },
                { value: '1.15', label: 'A' },
                { value: '1.3', label: 'A' },
              ]}
              value={String(prefs.fontScale)}
              onChange={(value) => prefs.set('fontScale', Number(value))}
            />
            <Text variant="caption" color="textTertiary">
              This multiplies your device text size, it does not replace it.
            </Text>
          </View>

          <ToggleRow
            label={t('settings.reduceMotion')}
            description={t('settings.reduceMotionBody')}
            value={prefs.reduceMotion}
            onChange={(value) => prefs.set('reduceMotion', value)}
          />
          <ToggleRow
            label={t('settings.haptics')}
            value={prefs.haptics}
            onChange={(value) => prefs.set('haptics', value)}
          />
        </Group>

        <Group title={t('settings.language')}>
          <ListRow
            title={t('settings.appLanguage')}
            meta={currentLocale?.label ?? prefs.uiLocale}
            onPress={() => setLanguageOpen(true)}
          />
          <ListRow
            title={t('settings.contentLanguage')}
            subtitle={t('settings.contentLanguageBody')}
            meta={currentContent}
            onPress={() => setContentLanguageOpen(true)}
          />
        </Group>

        <Group title={t('settings.notifications')}>
          <ToggleRow
            label={t('settings.notifyReview')}
            description={t('settings.notifyReviewBody')}
            value={prefs.notifyReviewDue}
            onChange={(value) => prefs.set('notifyReviewDue', value)}
          />
          <ToggleRow
            label={t('settings.notifyExam')}
            value={prefs.notifyExamCountdown}
            onChange={(value) => prefs.set('notifyExamCountdown', value)}
          />
          <ToggleRow
            label={t('settings.notifyProcessing')}
            value={prefs.notifyProcessingDone}
            onChange={(value) => prefs.set('notifyProcessingDone', value)}
          />
        </Group>

        <Group title={t('settings.account')}>
          <ListRow title={t('billing.title')} onPress={() => router.push('/settings/billing')} />
          <ListRow
            title={t('settings.privacy')}
            subtitle={t('settings.privacyBody')}
            onPress={() => router.push('/settings/privacy')}
          />
          <ListRow title={t('settings.support')} onPress={() => router.push('/settings/support')} />
        </Group>

        <Button
          label={t('auth.signOut')}
          variant="secondary"
          fullWidth
          loading={signOutAction.loading}
          onPress={() => void signOutAction.run()}
          style={styles.signOut}
        />

        <Text variant="caption" color="textTertiary" align="center" style={styles.version}>
          {t('settings.version', { version: config.appVersion })}
        </Text>
      </ScrollScreen>

      <Sheet
        visible={languageOpen}
        onClose={() => setLanguageOpen(false)}
        title={t('settings.appLanguage')}
      >
        <View style={styles.sheet}>
          {SUPPORTED_LOCALES.map((locale) => (
            <ListRow
              key={locale.code}
              title={locale.label}
              subtitle={locale.english}
              showChevron={false}
              left={
                prefs.uiLocale === locale.code ? (
                  <Icon name="check" size={18} color="accent" />
                ) : (
                  <View style={styles.checkSpacer} />
                )
              }
              onPress={() => {
                prefs.set('uiLocale', locale.code as LocaleCode);
                setLanguageOpen(false);
              }}
            />
          ))}
        </View>
      </Sheet>

      <Sheet
        visible={contentLanguageOpen}
        onClose={() => setContentLanguageOpen(false)}
        title={t('settings.contentLanguage')}
      >
        <View style={styles.sheet}>
          <ListRow
            title={t('onboarding.languageMatch')}
            subtitle={t('onboarding.languageMatchBody')}
            showChevron={false}
            left={
              prefs.contentLanguage === null ? (
                <Icon name="check" size={18} color="accent" />
              ) : (
                <View style={styles.checkSpacer} />
              )
            }
            onPress={() => {
              prefs.set('contentLanguage', null);
              setContentLanguageOpen(false);
            }}
          />
          {SUPPORTED_LOCALES.map((locale) => (
            <ListRow
              key={locale.code}
              title={locale.label}
              showChevron={false}
              left={
                prefs.contentLanguage === locale.code ? (
                  <Icon name="check" size={18} color="accent" />
                ) : (
                  <View style={styles.checkSpacer} />
                )
              }
              onPress={() => {
                prefs.set('contentLanguage', locale.code);
                setContentLanguageOpen(false);
              }}
            />
          ))}
        </View>
      </Sheet>
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text variant="captionStrong" color="textTertiary" uppercase>
        {title}
      </Text>
      <Card style={styles.groupCard}>{children}</Card>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md, marginTop: spacing.base, marginBottom: spacing.lg },
  back: { alignSelf: 'flex-start', paddingHorizontal: 0, width: 40 },
  banner: { marginBottom: spacing.base },
  group: { gap: spacing.sm, marginBottom: spacing.lg },
  groupCard: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  control: { gap: spacing.sm, paddingVertical: spacing.md },
  sheet: { paddingBottom: spacing.base },
  checkSpacer: { width: 18 },
  signOut: { marginTop: spacing.base },
  version: { marginTop: spacing.lg },
});
