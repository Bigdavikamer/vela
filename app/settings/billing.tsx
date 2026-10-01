import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { Badge, Banner, Button, Card, Icon, ScrollScreen, Text } from '../../src/components';
import { t } from '../../src/i18n';
import { api } from '../../src/lib/api';
import { FREE_LIMITS } from '../../src/lib/config';
import { useAsyncAction } from '../../src/hooks/useAsyncAction';
import { track } from '../../src/services/analytics';
import { useAuthStore } from '../../src/stores/auth';
import { useTheme } from '../../src/theme/ThemeProvider';
import { space as spacing } from '../../src/theme/tokens';

/**
 * Subscription management.
 *
 * Plan, renewal date, usage, and the way to cancel are all on one screen. The
 * cancel path goes to Stripe's own portal — two taps, no retention flow, no
 * "are you sure you want to lose everything" theatre.
 */
export default function Billing() {
  const router = useRouter();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  const billing = useQuery({
    queryKey: ['subscription', userId ?? ''],
    enabled: Boolean(userId),
    queryFn: () => api.billingStatus(),
  });

  const portal = useAsyncAction(async () => {
    const { url } = await api.billingPortal();
    await WebBrowser.openBrowserAsync(url);
    await queryClient.invalidateQueries({ queryKey: ['subscription'] });
  });

  const restore = useAsyncAction(async () => {
    const result = await api.billingRestore();
    if (result.restored) track('subscription_restored');
    await queryClient.invalidateQueries({ queryKey: ['subscription'] });
    return result;
  });

  const plan = billing.data?.plan ?? 'free';
  const subscription = billing.data?.subscription;
  const usage = billing.data?.usage;

  return (
    <ScrollScreen
      refreshControl={
        <RefreshControl refreshing={billing.isFetching} onRefresh={() => void billing.refetch()} />
      }
    >
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
        <Text variant="title2">{t('billing.title')}</Text>
      </View>

      {portal.error ? <Banner tone="danger" title={portal.error.message} style={styles.banner} /> : null}
      {restore.error ? <Banner tone="danger" title={restore.error.message} style={styles.banner} /> : null}

      <Card style={styles.plan}>
        <View style={styles.planHeader}>
          <Text variant="captionStrong" color="textSecondary">
            {t('billing.currentPlan')}
          </Text>
          <Badge
            label={plan === 'plus' ? t('billing.plus') : t('billing.free')}
            tint={plan === 'plus' ? theme.colors.accent : theme.colors.textTertiary}
          />
        </View>

        {subscription?.current_period_end ? (
          <Text variant="caption" color="textTertiary">
            {subscription.cancel_at_period_end
              ? t('billing.endsOn', {
                  date: new Date(subscription.current_period_end).toLocaleDateString(),
                })
              : t('billing.renewsOn', {
                  date: new Date(subscription.current_period_end).toLocaleDateString(),
                })}
          </Text>
        ) : null}

        {subscription?.cancel_at_period_end ? (
          <Text variant="caption" color="warning">
            {t('billing.canceling')}
          </Text>
        ) : null}
      </Card>

      {usage ? (
        <Card style={styles.usage}>
          <Text variant="captionStrong" color="textSecondary">
            {t('billing.usageThisMonth')}
          </Text>
          <UsageLine
            label={t('billing.usageSources')}
            value={usage.sources_processed}
            limit={plan === 'free' ? FREE_LIMITS.sourcesPerMonth : null}
          />
          <UsageLine
            label={t('billing.usageMinutes')}
            value={Math.round(usage.minutes_captured)}
            limit={plan === 'free' ? FREE_LIMITS.captureMinutesPerMonth : null}
          />
          <UsageLine
            label={t('billing.usageTutor')}
            value={usage.tutor_messages}
            limit={plan === 'free' ? FREE_LIMITS.tutorMessagesPerMonth : null}
          />
        </Card>
      ) : null}

      <View style={styles.actions}>
        {plan === 'plus' ? (
          <Button
            label={t('billing.manage')}
            fullWidth
            loading={portal.loading}
            icon={<Icon name="external-link" size={16} tint={theme.colors.onAccent} />}
            onPress={() => void portal.run()}
          />
        ) : (
          <Button label={t('billing.startPlus')} fullWidth onPress={() => router.push('/paywall')} />
        )}

        <Button
          label={restore.loading ? t('billing.restoring') : t('billing.restore')}
          variant="secondary"
          fullWidth
          onPress={() => void restore.run()}
        />
      </View>

      <Text variant="caption" color="textTertiary" style={styles.promise}>
        {t('billing.fairPromise')}
      </Text>
    </ScrollScreen>
  );
}

function UsageLine({
  label,
  value,
  limit,
}: {
  label: string;
  value: number;
  limit: number | null;
}) {
  return (
    <View style={styles.usageLine}>
      <Text variant="caption" color="textSecondary" style={styles.flex}>
        {label}
      </Text>
      <Text variant="caption" color="text">
        {limit === null ? `${value}` : `${value} / ${limit}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: spacing.md, marginTop: spacing.base, marginBottom: spacing.lg },
  back: { alignSelf: 'flex-start', paddingHorizontal: 0, width: 40 },
  banner: { marginBottom: spacing.base },
  plan: { gap: spacing.sm, marginBottom: spacing.base },
  planHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  usage: { gap: spacing.sm, marginBottom: spacing.lg },
  usageLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: { gap: spacing.sm },
  promise: { marginTop: spacing.lg },
});
