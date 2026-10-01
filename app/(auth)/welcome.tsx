import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLockup } from '../../src/components/Brand';
import { Button, Screen, Text } from '../../src/components';
import { t } from '../../src/i18n';
import { useReduceMotion, useTheme } from '../../src/theme/ThemeProvider';
import { motion, space } from '../../src/theme/tokens';

/**
 * First impression.
 *
 * One promise, one primary action. No feature grid, no carousel — a student
 * deciding whether to try this does not want a tour, they want to know what it
 * does in a sentence.
 */
export default function Welcome() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  const enter = (delay: number) =>
    reduceMotion ? undefined : FadeInDown.delay(delay).duration(motion.duration.slow);

  return (
    <Screen padded={false} edgeTop={false}>
      {/* A warm pool of light at the top, like a candle on a desk. */}
      <LinearGradient
        colors={[theme.colors.glow, 'transparent']}
        style={[styles.glow, { height: 340 + insets.top, pointerEvents: 'none' }]}
      />

      <View style={[styles.content, { paddingTop: insets.top + space.giant }]}>
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(600)}>
          <BrandLockup />
        </Animated.View>

        <View style={styles.copy}>
          <Animated.View entering={enter(160)}>
            <Text variant="title1" align="center">
              {t('auth.welcomeTitle')}
            </Text>
          </Animated.View>

          <Animated.View entering={enter(260)}>
            <Text variant="body" color="textSecondary" align="center" style={styles.body}>
              {t('auth.welcomeBody')}
            </Text>
          </Animated.View>
        </View>

        <Animated.View
          entering={enter(380)}
          style={[styles.actions, { paddingBottom: insets.bottom + space.xl }]}
        >
          <Button
            label={t('auth.signUp')}
            size="lg"
            fullWidth
            onPress={() => router.push('/(auth)/sign-up')}
          />
          <Button
            label={t('auth.signIn')}
            variant="secondary"
            size="lg"
            fullWidth
            onPress={() => router.push('/(auth)/sign-in')}
          />
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', top: 0, left: 0, right: 0 },
  content: { flex: 1, paddingHorizontal: space.lg, alignItems: 'center' },
  copy: { flex: 1, justifyContent: 'center', gap: space.md, maxWidth: 400 },
  body: { maxWidth: 340 },
  actions: { alignSelf: 'stretch', gap: space.md },
});
