import React, { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useReduceMotion, useTheme } from '../theme/ThemeProvider';
import { motion, radius, space } from '../theme/tokens';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/* -------------------------------------------------------------------------- */
/* Skeleton                                                                   */
/* -------------------------------------------------------------------------- */

export type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * A breathing placeholder. Skeletons mirror the real layout so nothing jumps
 * when content lands -- the most common cause of a screen feeling cheap.
 */
export function Skeleton({ width = '100%', height = 14, radius: r = radius.xs, style }: SkeletonProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 0.6;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.85, { duration: 720 }),
        withTiming(0.45, { duration: 720 }),
      ),
      -1,
      true,
    );
  }, [pulse, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: r, backgroundColor: theme.colors.fill },
        animatedStyle,
        style,
      ]}
    />
  );
}

/** Skeleton shaped like a generated note, used while the pipeline runs. */
export function NoteSkeleton() {
  return (
    <View style={{ gap: space.md }}>
      <Skeleton width="62%" height={22} />
      <Skeleton width="100%" />
      <Skeleton width="94%" />
      <Skeleton width="78%" />
      <View style={{ height: space.sm }} />
      <Skeleton width="48%" height={18} />
      <Skeleton width="100%" />
      <Skeleton width="88%" />
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Banner                                                                     */
/* -------------------------------------------------------------------------- */

export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

export type BannerProps = {
  tone?: BannerTone;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
};

const TONE_ICON: Record<BannerTone, IconName> = {
  info: 'info',
  success: 'check-circle',
  warning: 'alert-triangle',
  danger: 'alert-circle',
};

/**
 * Every failure surface in Vela uses this: it forces an explanation and, where
 * one exists, a recovery action. There is no bare "something went wrong".
 */
export function Banner({
  tone = 'info',
  title,
  message,
  actionLabel,
  onAction,
  onDismiss,
  style,
}: BannerProps) {
  const theme = useTheme();
  const { fg, bg } = toneColors(theme, tone);

  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: bg, borderColor: fg + '33' }, style]}
    >
      <Icon name={TONE_ICON[tone]} size={18} tint={fg} />
      <View style={styles.bannerBody}>
        <Text variant="captionStrong" tint={fg}>
          {title}
        </Text>
        {message ? (
          <Text variant="caption" color="textSecondary">
            {message}
          </Text>
        ) : null}
        {actionLabel && onAction ? (
          <View style={styles.bannerAction}>
            <Button label={actionLabel} variant="secondary" size="sm" onPress={onAction} />
          </View>
        ) : null}
      </View>
      {onDismiss ? (
        <Button
          label=""
          variant="ghost"
          size="sm"
          onPress={onDismiss}
          accessibilityLabel="Dismiss"
          icon={<Icon name="x" size={16} color="textTertiary" />}
          style={styles.bannerDismiss}
        />
      ) : null}
    </View>
  );
}

function toneColors(theme: ReturnType<typeof useTheme>, tone: BannerTone) {
  switch (tone) {
    case 'success': return { fg: theme.colors.success, bg: theme.colors.successSurface };
    case 'warning': return { fg: theme.colors.warning, bg: theme.colors.warningSurface };
    case 'danger':  return { fg: theme.colors.danger,  bg: theme.colors.dangerSurface };
    default:        return { fg: theme.colors.accent,  bg: theme.colors.accentSurface };
  }
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                */
/* -------------------------------------------------------------------------- */

export type EmptyStateProps = {
  icon?: IconName;
  title: string;
  /** one sentence that says what to do next, never just "nothing here" */
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function EmptyState({
  icon = 'feather',
  title,
  body,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  style,
}: EmptyStateProps) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const enter = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    enter.value = withTiming(1, { duration: reduceMotion ? 0 : motion.duration.slow });
  }, [enter, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 10 }],
  }));

  return (
    <Animated.View style={[styles.empty, animatedStyle, style]}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.colors.accentSurface }]}>
        <Icon name={icon} size={24} color="accent" />
      </View>
      <Text variant="title3" align="center">
        {title}
      </Text>
      <Text variant="callout" color="textSecondary" align="center" style={styles.emptyBody}>
        {body}
      </Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={styles.emptyAction} />
      ) : null}
      {secondaryLabel && onSecondary ? (
        <Button label={secondaryLabel} variant="ghost" size="sm" onPress={onSecondary} />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'flex-start',
  },
  bannerBody: { flex: 1, gap: space.xs },
  bannerAction: { alignSelf: 'flex-start', marginTop: space.xs },
  bannerDismiss: { paddingHorizontal: space.xs, height: 28 },

  empty: {
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.xxxl,
    paddingHorizontal: space.lg,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  emptyBody: { maxWidth: 320 },
  emptyAction: { marginTop: space.sm, minWidth: 200 },
});
