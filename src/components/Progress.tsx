import React, { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { useReduceMotion, useTheme } from '../theme/ThemeProvider';
import { motion, radius, space } from '../theme/tokens';
import { Text } from './Text';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type ProgressBarProps = {
  /** 0..1 */
  value: number;
  height?: number;
  tint?: string;
  trackColor?: string;
  /** announced to screen readers, e.g. "Building your study guide" */
  label?: string;
  style?: StyleProp<ViewStyle>;
};

export function ProgressBar({
  value,
  height = 6,
  tint,
  trackColor,
  label,
  style,
}: ProgressBarProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(clamp01(value));

  useEffect(() => {
    progress.value = withTiming(clamp01(value), {
      duration: reduceMotion ? 0 : motion.duration.slow,
    });
  }, [value, progress, reduceMotion]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamp01(value) * 100) }}
      style={[
        styles.track,
        { height, borderRadius: height / 2, backgroundColor: trackColor ?? theme.colors.fill },
        style,
      ]}
    >
      <Animated.View
        style={[
          { height, borderRadius: height / 2, backgroundColor: tint ?? theme.colors.accent },
          fillStyle,
        ]}
      />
    </View>
  );
}

export type ProgressRingProps = {
  /** 0..1 */
  value: number;
  size?: number;
  strokeWidth?: number;
  tint?: string;
  /** centred content; omit for a bare ring */
  children?: React.ReactNode;
  label?: string;
};

export function ProgressRing({
  value,
  size = 72,
  strokeWidth = 6,
  tint,
  children,
  label,
}: ProgressRingProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = useSharedValue(clamp01(value));

  useEffect(() => {
    progress.value = withTiming(clamp01(value), {
      duration: reduceMotion ? 0 : motion.duration.slow,
    });
  }, [value, progress, reduceMotion]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamp01(value) * 100) }}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={theme.colors.fill}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={tint ?? theme.colors.accent}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          // start at 12 o'clock
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

/**
 * Mastery is shown as filled segments rather than a continuous bar, and always
 * beside a word ("Shaky", "Solid"). Five discrete steps are easier to compare
 * at a glance than a percentage, and the label means the meaning does not
 * depend on seeing colour.
 */
export function MasteryMeter({
  value,
  label,
  compact,
}: {
  value: number;
  label?: string;
  compact?: boolean;
}) {
  const theme = useTheme();
  const filled = Math.round(clamp01(value) * 5);
  const tone =
    filled <= 1 ? theme.colors.danger : filled <= 3 ? theme.colors.warning : theme.colors.success;

  return (
    <View style={styles.mastery} accessible accessibilityLabel={`${label ?? masteryWord(filled)}, ${filled} of 5`}>
      <View style={styles.masterySegments}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              styles.masterySegment,
              {
                backgroundColor: i < filled ? tone : theme.colors.fill,
                width: compact ? 8 : 12,
              },
            ]}
          />
        ))}
      </View>
      {!compact ? (
        <Text variant="caption" tint={tone}>
          {label ?? masteryWord(filled)}
        </Text>
      ) : null}
    </View>
  );
}

export function masteryWord(filledOrValue: number): string {
  const filled = filledOrValue <= 1 ? Math.round(filledOrValue * 5) : filledOrValue;
  switch (filled) {
    case 0: return 'Not started';
    case 1: return 'Shaky';
    case 2: return 'Getting there';
    case 3: return 'Steady';
    case 4: return 'Solid';
    default: return 'Mastered';
  }
}

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden' },
  mastery: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  masterySegments: { flexDirection: 'row', gap: 3 },
  masterySegment: { height: 5, borderRadius: radius.xs },
});
