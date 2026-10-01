import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../i18n';
import { useReduceMotion, useTheme } from '../theme/ThemeProvider';
import { motion, radius, space } from '../theme/tokens';
import { Button } from './Button';
import { Icon } from './Icon';
import { Screen } from './Screen';
import { Text } from './Text';

/**
 * The shared frame for every onboarding step.
 *
 * Having one frame is what makes the flow feel like a single conversation
 * rather than five unrelated forms — the progress, the back control, and the
 * primary action all sit in exactly the same place each time.
 */
export function OnboardingStep({
  step,
  totalSteps,
  title,
  body,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryLoading,
  secondaryLabel,
  onSecondary,
  canGoBack = true,
}: {
  step: number;
  totalSteps: number;
  title: string;
  body?: string;
  children: React.ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  canGoBack?: boolean;
}) {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        {canGoBack && router.canGoBack() ? (
          <Button
            label=""
            variant="ghost"
            size="sm"
            accessibilityLabel={t('common.back')}
            icon={<Icon name="arrow-left" size={20} color="textSecondary" />}
            onPress={() => router.back()}
            style={styles.back}
          />
        ) : (
          <View style={styles.back} />
        )}

        <View
          style={styles.progress}
          accessibilityRole="progressbar"
          accessibilityLabel={`Step ${step} of ${totalSteps}`}
        >
          {Array.from({ length: totalSteps }, (_, i) => (
            <View
              key={i}
              style={[
                styles.pip,
                {
                  backgroundColor: i < step ? theme.colors.accent : theme.colors.fill,
                  width: i === step - 1 ? 20 : 6,
                },
              ]}
            />
          ))}
        </View>

        <View style={styles.back} />
      </View>

      <Animated.View
        entering={reduceMotion ? undefined : FadeIn.duration(motion.duration.base)}
        style={styles.body}
      >
        <View style={styles.copy}>
          <Text variant="title1">{title}</Text>
          {body ? (
            <Text variant="callout" color="textSecondary">
              {body}
            </Text>
          ) : null}
        </View>

        <View style={styles.content}>{children}</View>
      </Animated.View>

      <View style={[styles.actions, { paddingBottom: insets.bottom + space.lg }]}>
        <Button
          label={primaryLabel}
          size="lg"
          fullWidth
          disabled={primaryDisabled}
          loading={primaryLoading}
          onPress={onPrimary}
        />
        {secondaryLabel && onSecondary ? (
          <Button label={secondaryLabel} variant="ghost" onPress={onSecondary} />
        ) : null}
      </View>
    </Screen>
  );
}

/**
 * A large, tappable answer. Used for every multiple-choice step.
 *
 * Selection is signalled by a border, a fill, AND a check mark — three cues, so
 * the state does not depend on perceiving the accent colour.
 */
export function ChoiceCard({
  label,
  description,
  selected,
  onPress,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={description ? `${label}. ${description}` : label}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.choice,
        {
          borderColor: selected ? theme.colors.accent : theme.colors.border,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth * 2,
          backgroundColor: selected ? theme.colors.accentSurface : theme.colors.surface,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.choiceBody}>
        <Text variant="bodyStrong">{label}</Text>
        {description ? (
          <Text variant="caption" color="textSecondary">
            {description}
          </Text>
        ) : null}
      </View>
      {selected ? <Icon name="check" size={18} color="accent" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.base,
    paddingVertical: space.sm,
  },
  back: { width: 44, paddingHorizontal: 0 },
  progress: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  pip: { height: 6, borderRadius: radius.pill },
  body: { flex: 1, paddingHorizontal: space.lg },
  copy: { gap: space.sm, marginTop: space.lg, marginBottom: space.xl },
  content: { flex: 1 },
  actions: { paddingHorizontal: space.lg, gap: space.xs },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.base,
    paddingHorizontal: space.base,
    borderRadius: radius.md,
    minHeight: 64,
  },
  choiceBody: { flex: 1, gap: 2 },
});
