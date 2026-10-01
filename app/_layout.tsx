import { Fraunces_600SemiBold, useFonts } from '@expo-google-fonts/fraunces';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { qk, queryClient } from '../src/lib/queryClient';
import { startSupabaseAutoRefresh, supabase } from '../src/lib/supabase';
import { track } from '../src/services/analytics';
import { hydrateFromServer, usePreferences } from '../src/stores/preferences';
import { initAuthListener, useAuthStore } from '../src/stores/auth';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Fraunces_600SemiBold });
  const hydrated = usePreferences((s) => s.hydrated);
  const theme = usePreferences((s) => s.theme);
  const reduceMotion = usePreferences((s) => s.reduceMotion);
  const fontScale = usePreferences((s) => s.fontScale);
  const initialized = useAuthStore((s) => s.initialized);

  useEffect(() => {
    const teardown = initAuthListener();
    startSupabaseAutoRefresh();
    return teardown;
  }, []);

  // A missing brand font is a cosmetic problem, not a reason to block the app:
  // the type scale falls back to the platform serif.
  const ready = (fontsLoaded || Boolean(fontError)) && hydrated && initialized;

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync();
      track('app_opened');
    }
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <ThemeProvider
          preference={theme}
          reduceMotionPreference={reduceMotion}
          fontScale={fontScale}
        >
          <QueryClientProvider client={queryClient}>
            <ErrorBoundary>
              <RouteGuard />
            </ErrorBoundary>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Decides which of the three worlds the app is in: signed out, onboarding, or
 * the product. Keeping this in one place means no individual screen has to
 * defend itself against being reached in the wrong state.
 */
function RouteGuard() {
  const themeValue = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const session = useAuthStore((s) => s.session);
  const userId = session?.user.id;

  /**
   * Onboarding status is server state, so it lives in the query cache rather
   * than in local state here.
   *
   * It was local state once, read a single time per user id. Completing
   * onboarding wrote the timestamp to the database but left that copy stale at
   * `false`, so the next navigation was immediately replaced with
   * `/(onboarding)/subject` — an unescapable loop. `completeOnboarding()` now
   * primes this cache entry synchronously, so the guard sees the truth before
   * the navigation it triggers can land.
   */
  const onboardingQuery = useQuery({
    queryKey: qk.onboarding(userId ?? ''),
    enabled: Boolean(userId),
    staleTime: Infinity,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('onboarding_completed_at')
        .eq('id', userId!)
        .maybeSingle();
      return Boolean(data?.onboarding_completed_at);
    },
  });

  const onboardingComplete = userId ? (onboardingQuery.data ?? null) : null;

  useEffect(() => {
    if (userId) void hydrateFromServer(userId);
  }, [userId]);

  useEffect(() => {
    const group = segments[0];
    const inAuth = group === '(auth)';
    const inOnboarding = group === '(onboarding)';

    if (!session) {
      if (!inAuth) router.replace('/(auth)/welcome');
      return;
    }

    // Wait for the profile read rather than bouncing the user through
    // onboarding they have already finished.
    if (onboardingComplete === null) return;

    if (!onboardingComplete && !inOnboarding) {
      router.replace('/(onboarding)/subject');
      return;
    }
    if (onboardingComplete && (inAuth || inOnboarding)) {
      router.replace('/(tabs)');
    }
  }, [session, onboardingComplete, segments, router]);

  return (
    <View style={[styles.flex, { backgroundColor: themeValue.colors.bg }]}>
      <StatusBar style={themeValue.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: themeValue.colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="capture" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="search" options={{ animation: 'fade' }} />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
