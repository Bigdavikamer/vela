import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { t } from '../i18n';
import type { SourceKind, SourceStage } from '../services/sources';
import { useReduceMotion, useTheme } from '../theme/ThemeProvider';
import { motion, radius, space } from '../theme/tokens';
import { Icon } from './Icon';
import { ProgressBar } from './Progress';
import { Text } from './Text';

/**
 * The processing experience.
 *
 * A student who just recorded an hour-long lecture is going to wait a few
 * minutes. That wait should show real progress through real stages, not a
 * spinner — so they can tell the difference between "working" and "stuck", and
 * so leaving the screen feels safe.
 *
 * Every stage shown here corresponds to an actual pipeline step writing to the
 * database; none of it is theatre on a timer.
 */

type StageDef = { key: SourceStage; label: string };

function stagesFor(kind: SourceKind): StageDef[] {
  const isAudio = kind === 'recording' || kind === 'audio' || kind === 'video';

  return [
    isAudio
      ? { key: 'transcribe', label: t('processing.transcribing') }
      : { key: 'extract', label: t('processing.reading') },
    { key: 'structure', label: t('processing.structuring') },
    { key: 'concepts', label: t('processing.concepts') },
    { key: 'materials', label: t('processing.materials') },
  ];
}

const ORDER: SourceStage[] = [
  'upload', 'extract', 'transcribe', 'structure', 'concepts', 'materials', 'done',
];

export function ProcessingView({
  kind,
  stage,
  progress,
  title,
}: {
  kind: SourceKind;
  stage: SourceStage | null;
  progress: number;
  title: string;
}) {
  const theme = useTheme();
  const stages = stagesFor(kind);
  const currentIndex = ORDER.indexOf(stage ?? 'upload');

  return (
    <View style={styles.container}>
      <FlameLoader />

      <View style={styles.copy}>
        <Text variant="title3" align="center" numberOfLines={2}>
          {title}
        </Text>
        <Text variant="caption" color="textTertiary" align="center">
          {t('processing.stillWorking')}
        </Text>
      </View>

      <ProgressBar value={progress / 100} label={t('processing.stillWorking')} style={styles.bar} />

      <View style={styles.stages}>
        {stages.map((item) => {
          const index = ORDER.indexOf(item.key);
          const done = currentIndex > index;
          const active = currentIndex === index;

          return (
            <View key={item.key} style={styles.stage}>
              <View
                style={[
                  styles.stageIcon,
                  {
                    backgroundColor: done
                      ? theme.colors.successSurface
                      : active
                        ? theme.colors.accentSurface
                        : theme.colors.fill,
                  },
                ]}
              >
                {done ? (
                  <Icon name="check" size={13} color="success" />
                ) : active ? (
                  <PulsingDot />
                ) : (
                  <View style={[styles.pendingDot, { backgroundColor: theme.colors.textTertiary }]} />
                )}
              </View>

              <Text
                variant={active ? 'bodyStrong' : 'body'}
                color={done || active ? 'text' : 'textTertiary'}
              >
                {item.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** The brand mark, breathing. Reads as "alive" without a spinner. */
function FlameLoader() {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    scale.value = withRepeat(
      withSequence(
        withTiming(1.12, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
  }, [scale, reduceMotion]);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: 0.25 + (scale.value - 1) * 1.4,
  }));

  return (
    <View style={styles.loader}>
      <Animated.View
        style={[styles.halo, { backgroundColor: theme.colors.accent }, haloStyle]}
      />
      <View style={[styles.core, { backgroundColor: theme.colors.accentSurface }]}>
        <Icon name="feather" size={26} color="accent" />
      </View>
    </View>
  );
}

function PulsingDot() {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: motion.duration.slow }),
        withTiming(1, { duration: motion.duration.slow }),
      ),
      -1,
      true,
    );
  }, [opacity, reduceMotion]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[styles.activeDot, { backgroundColor: theme.colors.accent }, style]}
    />
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: space.lg, paddingVertical: space.xxl },
  loader: { alignItems: 'center', justifyContent: 'center', height: 120 },
  halo: { position: 'absolute', width: 110, height: 110, borderRadius: 55 },
  core: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { gap: space.xs, alignItems: 'center' },
  bar: { maxWidth: 320 },
  stages: { alignSelf: 'stretch', gap: space.base, marginTop: space.sm },
  stage: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stageIcon: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeDot: { width: 8, height: 8, borderRadius: 4 },
  pendingDot: { width: 5, height: 5, borderRadius: 3, opacity: 0.5 },
});
