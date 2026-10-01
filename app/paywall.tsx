import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, Button, Card, Icon, ScrollScreen, Segmented, Text } from '../src/components';
import { t } from '../src/i18n';
import { api } from '../src/lib/api';
import { FREE_LIMITS } from '../src/lib/config';
import { useAsyncAction } from '../src/hooks/useAsyncAction';
import { track } from '../src/services/analytics';
import { space as spacing } from '../src/theme/tokens';

/**
 * The paywall.
 *
 * Deliberately free of dark patterns: no countdown, no fake scarcity, no
 * disguised close button, and the free tier is described honestly right next to
 * the paid one. The cancellation promise is stated up front because a student
 * deciding to pay deserves to know how to stop paying.
 */
export default function Paywall() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [interval, setInterval] = useState<'year' | 'month'>('year');

  useEffect(() => {
    track('paywall_viewed');
  }, []);

  const checkout = useAsyncAction(async () => {
    track('checkout_started', { interval });
    const { url } = await api.billingCheckout(interval);

    // The system browser, not a WebView: the student sees Stripe's real URL and
    // padlock, and their saved cards and wallets work.
    await WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });

    // Entitlement is decided by the webhook; re-read it rather than assuming.
    await queryClient.invalidateQueries({ queryKey: ['subscription'] });
  });

  const restore = useAsyncAction(async () => {
    const result = await api.billingRestore();
    if (result.restored) {
      track('subscription_restored');
      await queryClient.invalidateQueries({ queryKey: ['subscription'] });
      router.back();
    }
    return result;
  });

  const features = [
    { icon: 'infinity' as const, label: t('billing.featureUnlimited') },
    { icon: 'mic' as const, label: t('billing.featureLongRecordings') },
    { icon: 'message-circle' as const, label: t('billing.featureTutor') },
    { icon: 'calendar' as const, label: t('billing.featureExam') },
    { icon: 'zap' as const, label: t('billing.featurePriority') },
  ];

  return (
    <ScrollScreen bottomInset={spacing.giant}>
      <View style={styles.header}>
        <Text variant="title2" style={styles.flex}>
          {t('billing.title')}
        </Text>
        {/* A real, obvious close control. */}
        <Button
          label=""
          variant="ghost"
          size="sm"
          accessibilityLabel={t('common.close')}
          icon={<Icon name="x" size={20} color="textSecondary" />}
          onPress={() => router.back()}
        />
      </View>

      <Text variant="callout" color="textSecondary" style={styles.intro}>
        {t('billing.upgradeBody')}
      </Text>

      {checkout.error ? (
        <Banner tone="danger" title={checkout.error.message} style={styles.banner} />
      ) : null}

      <Card style={styles.features}>
        {features.map((feature) => (
          <View key={feature.label} style={styles.feature}>
            <Icon name={feature.icon === 'infinity' ? 'repeat' : feature.icon} size={16} color="accent" />
            <Text variant="body" style={styles.flex}>
              {feature.label}
            </Text>
          </View>
        ))}
      </Card>

      <Segmented
        options={[
          { value: 'year', label: t('billing.yearly') },
          { value: 'month', label: t('billing.monthly') },
        ]}
        value={interval}
        onChange={setInterval}
        style={styles.interval}
      />

      <Button
        label={t('billing.startPlus')}
        size="lg"
        fullWidth
        loading={checkout.loading}
        onPress={() => void checkout.run()}
      />

      <View style={styles.promise}>
        <Icon name="shield" size={14} color="textTertiary" />
        <Text variant="caption" color="textTertiary" style={styles.flex}>
          {t('billing.fairPromise')}
        </Text>
      </View>

      {/* The free tier, stated plainly rather than hidden. */}
      <Card style={styles.free}>
        <Text variant="captionStrong" color="textSecondary">
          {t('billing.freeIncludes')}
        </Text>
        <Text variant="caption" color="textTertiary">
          • {t('billing.freeSources', { count: FREE_LIMITS.sourcesPerMonth })}
        </Text>
        <Text variant="caption" color="textTertiary">
          • {t('billing.freeMinutes', { count: FREE_LIMITS.captureMinutesPerMonth })}
        </Text>
        <Text variant="caption" color="textTertiary">
          • {t('billing.freeTutor', { count: FREE_LIMITS.tutorMessagesPerMonth })}
        </Text>
        <Text variant="caption" color="textTertiary">
          • {t('billing.freeEverythingElse')}
        </Text>
      </Card>

      <View style={[styles.footer, { paddingBottom: insets.bottom }]}>
        <Button
          label={restore.loading ? t('billing.restoring') : t('billing.restore')}
          variant="ghost"
          size="sm"
          onPress={() => void restore.run()}
        />
        <Button
          label={t('billing.notReady')}
          variant="ghost"
          size="sm"
          onPress={() => router.back()}
        />
      </View>

      {restore.error ? <Banner tone="danger" title={restore.error.message} /> : null}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.base },
  intro: { marginTop: spacing.sm, marginBottom: spacing.lg },
  banner: { marginBottom: spacing.base },
  features: { gap: spacing.md, marginBottom: spacing.lg },
  feature: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  interval: { marginBottom: spacing.base },
  promise: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    alignItems: 'flex-start',
  },
  free: { gap: spacing.xs },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: spacing.base, marginTop: spacing.lg },
});
