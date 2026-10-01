import * as Haptics from 'expo-haptics';
import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useReduceMotion, useTheme } from '../theme/ThemeProvider';
import { motion, radius, space } from '../theme/tokens';
import { Text } from './Text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** rendered before the label */
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
  /** suppress the tap haptic (e.g. inside a rapid-fire grading row) */
  haptic?: boolean;
  style?: ViewStyle;
};

const SIZES: Record<ButtonSize, { height: number; px: number; gap: number }> = {
  sm: { height: 36, px: space.md, gap: space.xs },
  md: { height: 48, px: space.lg, gap: space.sm },
  lg: { height: 56, px: space.xl, gap: space.sm },
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  fullWidth,
  haptic = true,
  disabled,
  onPress,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const pressed = useSharedValue(0);

  const isDisabled = disabled || loading;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : 1 - pressed.value * 0.025 }],
    opacity: 1 - pressed.value * 0.12,
  }));

  const handlePressIn = useCallback(() => {
    pressed.value = reduceMotion
      ? withTiming(1, { duration: motion.duration.instant })
      : withSpring(1, motion.spring.responsive);
  }, [pressed, reduceMotion]);

  const handlePressOut = useCallback(() => {
    pressed.value = reduceMotion
      ? withTiming(0, { duration: motion.duration.instant })
      : withSpring(0, motion.spring.responsive);
  }, [pressed, reduceMotion]);

  const handlePress = useCallback<NonNullable<PressableProps['onPress']>>(
    (event) => {
      if (haptic) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
          /* haptics are a nicety; never let them break an action */
        });
      }
      onPress?.(event);
    },
    [haptic, onPress],
  );

  const { bg, fg, border } = resolveColors(theme, variant, isDisabled);
  const dims = SIZES[size];

  return (
    <AnimatedPressable
      {...rest}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      accessibilityLabel={rest.accessibilityLabel ?? label}
      disabled={isDisabled}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      // 44pt is the minimum comfortable target; `sm` buttons get hit-slop
      // rather than a larger visual box.
      hitSlop={dims.height < 44 ? (44 - dims.height) / 2 : 0}
      style={[
        styles.base,
        {
          height: dims.height,
          paddingHorizontal: dims.px,
          gap: dims.gap,
          backgroundColor: bg,
          borderColor: border,
          borderWidth: border === 'transparent' ? 0 : StyleSheet.hairlineWidth * 2,
          borderRadius: radius.md,
          opacity: isDisabled ? 0.5 : 1,
        },
        fullWidth ? styles.fullWidth : null,
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <Text
            variant={size === 'sm' ? 'captionStrong' : 'bodyStrong'}
            tint={fg}
            numberOfLines={1}
          >
            {label}
          </Text>
          {iconRight ? <View style={styles.icon}>{iconRight}</View> : null}
        </>
      )}
    </AnimatedPressable>
  );
}

function resolveColors(
  theme: ReturnType<typeof useTheme>,
  variant: ButtonVariant,
  _disabled?: boolean,
) {
  const c = theme.colors;
  switch (variant) {
    case 'primary':
      return { bg: c.accent, fg: c.onAccent, border: 'transparent' };
    case 'secondary':
      return { bg: c.surface, fg: c.text, border: c.border };
    case 'ghost':
      return { bg: 'transparent', fg: c.textSecondary, border: 'transparent' };
    case 'danger':
      return { bg: c.dangerSurface, fg: c.danger, border: 'transparent' };
  }
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
  icon: { alignItems: 'center', justifyContent: 'center' },
});
