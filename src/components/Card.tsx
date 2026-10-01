import React, { useCallback } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { useReduceMotion, useTheme } from '../theme/ThemeProvider';
import { motion, radius, space } from '../theme/tokens';
import { Icon } from './Icon';
import { Text } from './Text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type CardProps = {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  /** a thin left rule in the space's colour, for list contexts */
  accent?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export function Card({
  children,
  onPress,
  style,
  padded = true,
  accent,
  accessibilityLabel,
  accessibilityHint,
}: CardProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : 1 - pressed.value * 0.012 }],
  }));

  const setPressed = useCallback(
    (v: number) => () => {
      pressed.value = reduceMotion
        ? withTiming(v, { duration: motion.duration.instant })
        : withSpring(v, motion.spring.responsive);
    },
    [pressed, reduceMotion],
  );

  const body = (
    <>
      {accent ? (
        <View style={[styles.accentRule, { backgroundColor: accent }]} />
      ) : null}
      {children}
    </>
  );

  const base: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    ...(padded ? { padding: space.base } : null),
  };

  if (!onPress) {
    return <View style={[base, theme.shadow.card, style]}>{body}</View>;
  }

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      onPressIn={setPressed(1)}
      onPressOut={setPressed(0)}
      style={[base, theme.shadow.card, animatedStyle, style]}
    >
      {body}
    </AnimatedPressable>
  );
}

export type ListRowProps = {
  title: string;
  subtitle?: string;
  /** short right-aligned status, e.g. "12 due" */
  meta?: string;
  left?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  destructive?: boolean;
  accessibilityHint?: string;
};

export function ListRow({
  title,
  subtitle,
  meta,
  left,
  onPress,
  showChevron = true,
  destructive,
  accessibilityHint,
}: ListRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={[title, subtitle, meta].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent' },
      ]}
    >
      {left ? <View style={styles.rowLeft}>{left}</View> : null}
      <View style={styles.rowBody}>
        <Text variant="bodyStrong" color={destructive ? 'danger' : 'text'} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {meta ? (
        <Text variant="caption" color="textTertiary" style={styles.rowMeta}>
          {meta}
        </Text>
      ) : null}
      {onPress && showChevron ? <Icon name="chevron-right" size={18} color="textTertiary" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  accentRule: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.base,
    minHeight: 56,
  },
  rowLeft: { width: 34, alignItems: 'center' },
  rowBody: { flex: 1, gap: 2 },
  rowMeta: { marginLeft: space.sm },
});
