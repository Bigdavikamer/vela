import React, { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Path, RadialGradient, Stop, Circle } from 'react-native-svg';

import { useReduceMotion, useTheme, useTypeStyle } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';
import { Text } from './Text';

/**
 * The Vela mark: a flame that reads as a sail.
 *
 * "Vela" is candle in Portuguese and sail in Latin, and it is also a
 * constellation — the three meanings give the brand its whole visual world
 * (warm light, forward motion, a night sky). The mark is drawn rather than
 * shipped as a bitmap so it stays crisp and can take the theme's accent.
 */

export function VelaMark({ size = 44, tint }: { size?: number; tint?: string }) {
  const theme = useTheme();
  const color = tint ?? theme.colors.accent;

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <RadialGradient id="glow" cx="50%" cy="62%" r="52%">
          <Stop offset="0%" stopColor={color} stopOpacity={0.42} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>

      <Circle cx={24} cy={28} r={22} fill="url(#glow)" />

      {/* The flame/sail: a taut leading edge and a curved leech. */}
      <Path
        d="M24 5 C24 5, 36 16.5, 36 27.5 C36 34.7, 30.6 40.5, 24 40.5 C17.4 40.5, 12 34.7, 12 27.5 C12 20.5, 17 14.5, 24 5 Z"
        fill={color}
      />
      {/* Inner cool core, the way a real flame is brightest away from centre. */}
      <Path
        d="M24 18 C24 18, 30 24.5, 30 29.6 C30 33.3, 27.3 36.2, 24 36.2 C20.7 36.2, 18 33.3, 18 29.6 C18 25.6, 21 22, 24 18 Z"
        fill={theme.colors.bg}
        opacity={0.28}
      />
    </Svg>
  );
}

/** The mark with a slow, barely-there flicker. Used once, on the welcome screen. */
export function VelaMarkAnimated({ size = 64 }: { size?: number }) {
  const reduceMotion = useReduceMotion();
  const flicker = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    // Slow and shallow: a candle, not a strobe.
    flicker.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 2200, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.97, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
  }, [flicker, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: flicker.value }],
    opacity: 0.9 + (flicker.value - 1) * 2,
  }));

  return (
    <Animated.View style={animatedStyle}>
      <VelaMark size={size} />
    </Animated.View>
  );
}

export function Wordmark({
  size = 34,
  tint,
  style,
}: {
  size?: number;
  tint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const displayStyle = useTypeStyle('display', 'Fraunces_600SemiBold');

  return (
    <View style={[styles.wordmark, style]}>
      <Text
        style={[displayStyle, { fontSize: size, lineHeight: size * 1.15 }]}
        tint={tint ?? theme.colors.text}
      >
        Vela
      </Text>
    </View>
  );
}

export function BrandLockup({ tagline }: { tagline?: string }) {
  return (
    <View style={styles.lockup}>
      <VelaMarkAnimated size={72} />
      <Wordmark size={40} style={styles.lockupWord} />
      {tagline ? (
        <Text variant="callout" color="textSecondary" align="center">
          {tagline}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wordmark: { flexDirection: 'row', alignItems: 'center' },
  lockup: { alignItems: 'center', gap: space.md },
  lockupWord: { marginTop: space.xs },
});
