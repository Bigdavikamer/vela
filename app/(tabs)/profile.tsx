import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Icon, ListRow, ScrollScreen, Text } from '../../src/components';
import { t } from '../../src/i18n';
import { api } from '../../src/lib/api';
import { qk } from '../../src/lib/queryClient';
import { supabase } from '../../src/lib/supabase';
import { FREE_LIMITS } from '../../src/lib/config';
import { useInsights } from '../../src/services/sessions';
import { useAuthStore } from '../../src/stores/auth';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius, space as spacing } from '../../src/theme/tokens';

/**
 * Account, plan, and progress.
 *
 * Plan status and its usage are shown here rather than hidden behind a settings
 * sub-page, because "what am I on and how much have I used" should never
 * require hunting.
 */
export default function Profile() {
  const router = useRouter();
  const theme = useTheme();
  const user = useAuthStore((s) => s.user);
  const insights = useInsights();

  const profile = useQuery({
    queryKey: qk.profile(user?.id ?? ''),
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user!.id)
        .maybeSingle();
      return data;
    },
  });

  const billing = useQuery({
    queryKey: qk.subscription(user?.id ?? ''),
    enabled: Boolean(user?.id),
    queryFn: () => api.billingStatus(),
    // Entitlement is server truth; a stale plan badge is worse than a refetch.
    staleTime: 60_000,
  });

  const plan = billing.data?.plan ?? 'free';
  const usage = billing.data?.usage;

  return (
    <ScrollScreen>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: theme.colors.accentSurface }]}>
          <Text variant="title2" color="accent">
            {(profile.data?.display_name ?? user?.email ?? '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.headerBody}>
          <Text variant="title3" numberOfLines={1}>
            {profile.data?.display_name ?? t('settings.profile')}
          </Text>
          <Text variant="caption" color="textTertiary" numberOfLines={1}>
            {user?.email}
          </Text>
        </View>
        <Badge
          label={plan === 'plus' ? t('billing.plus') : t('billing.free')}
          tint={plan === 'plus' ? theme.colors.accent : theme.colors.textTertiary}
        />
      </View>

      {plan === 'free' && usage ? (
        <Card style={styles.usage}>
          <Text variant="captionStrong" color="textSecondary">
            {t('billing.usageThisMonth')}
          </Text>
          <UsageRow
            label={t('billing.usageSources')}
            used={usage.sources_processed}
            limit={FREE_LIMITS.sourcesPerMonth}
          />
          <UsageRow
            label={t('billing.usageMinutes')}
            used={Math.round(usage.minutes_captured)}
            limit={FREE_LIMITS.captureMinutesPerMonth}
          />
          <UsageRow
            label={t('billing.usageTutor')}
            used={usage.tutor_messages}
            limit={FREE_LIMITS.tutorMessagesPerMonth}
          />
          <Button
            label={t('billing.startPlus')}
            onPress={() => router.push('/paywall')}
            style={styles.upgrade}
          />
        </Card>
      ) : null}

      <View style={styles.stats}>
        <Stat label={t('insights.studyTime')} value={`${insights.data?.minutesThisWeek ?? 0}m`} />
        <Stat label={t('insights.conceptsMastered')} value={`${insights.data?.conceptsSolid ?? 0}`} />
        <Stat label={t('insights.consistency')} value={`${insights.data?.activeDays ?? 0}/7`} />
      </View>

      <Card padded={false} style={styles.menu}>
        <ListRow
          title={t('settings.title')}
          left={<Icon name="settings" size={20} color="textSecondary" />}
          onPress={() => router.push('/settings')}
        />
        <Divider />
        <ListRow
          title={t('billing.manage')}
          left={<Icon name="credit-card" size={20} color="textSecondary" />}
          onPress={() => router.push('/settings/billing')}
        />
        <Divider />
        <ListRow
          title={t('settings.privacy')}
          subtitle={t('settings.privacyBody')}
          left={<Icon name="lock" size={20} color="textSecondary" />}
          onPress={() => router.push('/settings/privacy')}
        />
        <Divider />
        <ListRow
          title={t('settings.support')}
          left={<Icon name="life-buoy" size={20} color="textSecondary" />}
          onPress={() => router.push('/settings/support')}
        />
      </Card>
    </ScrollScreen>
  );
}

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number }) {
  const theme = useTheme();
  const fraction = Math.min(1, used / limit);
  const nearLimit = fraction >= 0.8;

  return (
    <View style={styles.usageRow}>
      <View style={styles.usageLabel}>
        <Text variant="caption" color="textSecondary">
          {label}
        </Text>
        <Text variant="caption" color={nearLimit ? 'warning' : 'textTertiary'}>
          {used} / {limit}
        </Text>
      </View>
      <View style={[styles.usageTrack, { backgroundColor: theme.colors.fill }]}>
        <View
          style={[
            styles.usageFill,
            {
              width: `${fraction * 100}%`,
              backgroundColor: nearLimit ? theme.colors.warning : theme.colors.accent,
            },
          ]}
        />
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card style={styles.stat}>
      <Text variant="title2">{value}</Text>
      <Text variant="caption" color="textTertiary" numberOfLines={2}>
        {label}
      </Text>
    </Card>
  );
}

function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.base,
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBody: { flex: 1, gap: 2 },

  usage: { gap: spacing.md, marginBottom: spacing.base },
  usageRow: { gap: spacing.xs },
  usageLabel: { flexDirection: 'row', justifyContent: 'space-between' },
  usageTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  usageFill: { height: 5, borderRadius: 3 },
  upgrade: { marginTop: spacing.xs },

  stats: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  stat: { flex: 1, gap: spacing.xs, alignItems: 'flex-start' },

  menu: { overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacing.huge },
});
