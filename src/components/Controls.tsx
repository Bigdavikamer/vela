import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useReduceMotion, useTheme } from '../theme/ThemeProvider';
import { motion, radius, space } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/* -------------------------------------------------------------------------- */
/* Chip                                                                       */
/* -------------------------------------------------------------------------- */

export type ChipProps = {
  label: string;
  icon?: IconName;
  selected?: boolean;
  onPress?: () => void;
  tint?: string;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
};

export function Chip({ label, icon, selected, onPress, tint, size = 'md', style }: ChipProps) {
  const theme = useTheme();
  const accent = tint ?? theme.colors.accent;
  const height = size === 'sm' ? 28 : 34;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={!onPress}
      hitSlop={height < 44 ? (44 - height) / 2 : 0}
      style={({ pressed }) => [
        styles.chip,
        {
          height,
          paddingHorizontal: size === 'sm' ? space.sm : space.md,
          borderRadius: radius.pill,
          backgroundColor: selected ? accent + '1F' : theme.colors.fill,
          borderColor: selected ? accent : 'transparent',
          borderWidth: selected ? 1.5 : 0,
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={13} tint={selected ? accent : theme.colors.textSecondary} /> : null}
      <Text
        variant={size === 'sm' ? 'micro' : 'caption'}
        tint={selected ? accent : theme.colors.textSecondary}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/* Badge                                                                      */
/* -------------------------------------------------------------------------- */

export function Badge({ label, tint }: { label: string; tint?: string }) {
  const theme = useTheme();
  const color = tint ?? theme.colors.accent;
  return (
    <View style={[styles.badge, { backgroundColor: color + '22' }]}>
      <Text variant="micro" tint={color}>
        {label}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Segmented control                                                          */
/* -------------------------------------------------------------------------- */

export type SegmentedOption<T extends string> = { value: T; label: string };

export type SegmentedProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * The selected pill slides between segments rather than blinking, which makes
 * the relationship between the old and new selection legible.
 */
export function Segmented<T extends string>({ options, value, onChange, style }: SegmentedProps<T>) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = React.useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const offset = useSharedValue(index);

  React.useEffect(() => {
    offset.value = reduceMotion
      ? withTiming(index, { duration: motion.duration.instant })
      : withSpring(index, motion.spring.responsive);
  }, [index, offset, reduceMotion]);

  const segmentWidth = width > 0 ? (width - 4) / options.length : 0;

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value * segmentWidth }],
    width: segmentWidth,
  }));

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.segmented, { backgroundColor: theme.colors.fill }, style]}
    >
      {segmentWidth > 0 ? (
        <Animated.View
          style={[
            styles.segmentedPill,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            pillStyle,
          ]}
        />
      ) : null}

      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => {
              if (selected) return;
              Haptics.selectionAsync().catch(() => {});
              onChange(option.value);
            }}
            style={styles.segment}
          >
            <Text
              variant="captionStrong"
              color={selected ? 'text' : 'textSecondary'}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Switch row                                                                 */
/* -------------------------------------------------------------------------- */

export function ToggleRow({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const knob = useSharedValue(value ? 1 : 0);

  React.useEffect(() => {
    knob.value = reduceMotion
      ? withTiming(value ? 1 : 0, { duration: motion.duration.instant })
      : withSpring(value ? 1 : 0, motion.spring.responsive);
  }, [value, knob, reduceMotion]);

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knob.value * 20 }] }));
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: knob.value > 0.5 ? theme.colors.accent : theme.colors.fillStrong,
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      accessibilityLabel={label}
      accessibilityHint={description}
      disabled={disabled}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onChange(!value);
      }}
      style={[styles.toggleRow, { opacity: disabled ? 0.5 : 1 }]}
    >
      <View style={styles.toggleBody}>
        <Text variant="body">{label}</Text>
        {description ? (
          <Text variant="caption" color="textSecondary">
            {description}
          </Text>
        ) : null}
      </View>
      <Animated.View style={[styles.toggleTrack, trackStyle]}>
        <Animated.View style={[styles.toggleKnob, knobStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.xs },

  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.xs,
    alignSelf: 'flex-start',
  },

  segmented: {
    flexDirection: 'row',
    padding: 2,
    borderRadius: radius.md,
    position: 'relative',
  },
  segmentedPill: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: 2,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm,
    minHeight: 40,
  },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.base,
    paddingVertical: space.md,
    minHeight: 56,
  },
  toggleBody: { flex: 1, gap: 2 },
  toggleTrack: {
    width: 46,
    height: 28,
    borderRadius: radius.pill,
    padding: 3,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },
});
