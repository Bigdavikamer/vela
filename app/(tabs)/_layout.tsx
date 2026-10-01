import * as Haptics from 'expo-haptics';
import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text, type IconName } from '../../src/components';
import { t } from '../../src/i18n';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius, space } from '../../src/theme/tokens';

/**
 * Four destinations and one action.
 *
 * Home answers "what should I do next", Library is everything you own, Study is
 * the act of studying, and You is the account. Capture is not a destination —
 * it is the thing you do — so it is a raised action in the middle rather than a
 * fifth tab you would have to navigate away from.
 */
export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      tabBar={(props) => <VelaTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="library" options={{ title: t('library.title') }} />
      <Tabs.Screen name="study" options={{ title: 'Study' }} />
      <Tabs.Screen name="profile" options={{ title: 'You' }} />
    </Tabs>
  );
}

// Derived from the Tabs component rather than imported: expo-router vendors
// @react-navigation/bottom-tabs, so its types are not resolvable directly.
type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

const TAB_ICONS: Record<string, IconName> = {
  index: 'home',
  library: 'book-open',
  study: 'layers',
  profile: 'user',
};

const TAB_LABELS: Record<string, string> = {
  index: 'Home',
  library: 'Library',
  study: 'Study',
  profile: 'You',
};

function VelaTabBar({ state, navigation }: TabBarProps) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const left = state.routes.slice(0, 2);
  const right = state.routes.slice(2);

  const renderTab = (route: { key: string; name: string }) => {
    const index = state.routes.findIndex((r) => r.key === route.key);
    const focused = state.index === index;

    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={TAB_LABELS[route.name] ?? route.name}
        onPress={() => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            Haptics.selectionAsync().catch(() => {});
            navigation.navigate(route.name);
          }
        }}
        style={styles.tab}
      >
        <Icon
          name={TAB_ICONS[route.name] ?? 'circle'}
          size={22}
          tint={focused ? theme.colors.accent : theme.colors.textTertiary}
        />
        <Text
          variant="micro"
          tint={focused ? theme.colors.accent : theme.colors.textTertiary}
          numberOfLines={1}
        >
          {TAB_LABELS[route.name] ?? route.name}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          paddingBottom: insets.bottom || space.sm,
        },
      ]}
    >
      {left.map(renderTab)}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('capture.title')}
        accessibilityHint={t('capture.subtitle')}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          router.push('/capture');
        }}
        style={({ pressed }) => [styles.captureWrap, { opacity: pressed ? 0.85 : 1 }]}
      >
        <View style={[styles.capture, { backgroundColor: theme.colors.accent }]}>
          <Icon name="plus" size={24} tint={theme.colors.onAccent} />
        </View>
      </Pressable>

      {right.map(renderTab)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.sm,
    paddingHorizontal: space.xs,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: space.xs,
    // Comfortably above the 44pt minimum target.
    minHeight: 48,
  },
  captureWrap: { width: 72, alignItems: 'center' },
  capture: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -18,
  },
});
