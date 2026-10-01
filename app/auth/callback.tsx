import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Screen, Text } from '../../src/components';
import { t } from '../../src/i18n';
import { useAuthStore } from '../../src/stores/auth';
import { useTheme } from '../../src/theme/ThemeProvider';
import { space } from '../../src/theme/tokens';

/**
 * Landing point for magic-link and email-confirmation deep links.
 *
 * Supabase's client picks the session up from the URL fragment and the auth
 * listener fires; this screen just waits for that and gets out of the way.
 */
export default function AuthCallback() {
  const router = useRouter();
  const theme = useTheme();
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    if (session) router.replace('/(tabs)');
  }, [session, router]);

  // If the link was stale or already used, do not strand the user here.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!useAuthStore.getState().session) router.replace('/(auth)/sign-in');
    }, 6000);
    return () => clearTimeout(timeout);
  }, [router]);

  return (
    <Screen>
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
        <Text variant="callout" color="textSecondary">
          {t('common.loading')}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md },
});
