import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Chip, Field, Icon, ProgressRing, Screen, Segmented, Text } from '../../src/components';
import { t } from '../../src/i18n';
import { track } from '../../src/services/analytics';
import { endSession, startSession, type SessionMode } from '../../src/services/sessions';
import { usePreferences, type AmbienceKey } from '../../src/stores/preferences';
import { useReduceMotion, useTheme } from '../../src/theme/ThemeProvider';
import { radius, space as spacing } from '../../src/theme/tokens';

const DURATIONS = [15, 25, 45, 60];

const AMBIENCE: { key: AmbienceKey; labelKey: string }[] = [
  { key: 'none', labelKey: 'focus.ambienceNone' },
  { key: 'rain', labelKey: 'focus.ambienceRain' },
  { key: 'library', labelKey: 'focus.ambienceLibrary' },
  { key: 'fireplace', labelKey: 'focus.ambienceFire' },
  { key: 'cafe', labelKey: 'focus.ambienceCafe' },
  { key: 'ocean', labelKey: 'focus.ambienceOcean' },
  { key: 'night', labelKey: 'focus.ambienceNight' },
  { key: 'forest', labelKey: 'focus.ambienceForest' },
];

/**
 * Focus mode.
 *
 * A timer exists here to serve studying, not to become a productivity app: it
 * has a goal, one break rule, and an end. Time only accrues while the session
 * is actually running, so the number at the end is honest.
 *
 * Ambience selection is stored and drives the visual atmosphere. Sound files
 * are not bundled in this build, so the picker changes the environment's look
 * and is explicit that audio is not playing rather than pretending it is.
 */
export default function Focus() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const defaultMinutes = usePreferences((s) => s.sessionMinutes);
  const defaultAmbience = usePreferences((s) => s.ambience);
  const setPreference = usePreferences((s) => s.set);

  const [running, setRunning] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<SessionMode>('focus');
  const [minutes, setMinutes] = useState(defaultMinutes);
  const [ambience, setAmbience] = useState<AmbienceKey>(defaultAmbience);
  const [goal, setGoal] = useState('');
  const [remaining, setRemaining] = useState(defaultMinutes * 60);
  const [finished, setFinished] = useState(false);
  /** frozen at the moment the timer ends, so the summary never reads a ref mid-render */
  const [finalSeconds, setFinalSeconds] = useState(0);

  const focusedSeconds = useRef(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  /* --- timer ------------------------------------------------------------- */

  useEffect(() => {
    if (!running) {
      if (tick.current) clearInterval(tick.current);
      return;
    }

    tick.current = setInterval(() => {
      focusedSeconds.current += 1;
      setRemaining((value) => {
        if (value <= 1) {
          setRunning(false);
          setFinalSeconds(focusedSeconds.current);
          setFinished(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          return 0;
        }
        return value - 1;
      });
    }, 1000);

    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [running]);

  // Backgrounding pauses the count: a session left running in a pocket is not
  // study time, and inflating the number would make the metric worthless.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && running) setRunning(false);
    });
    return () => subscription.remove();
  }, [running]);

  const start = useCallback(async () => {
    const session = await startSession({
      mode,
      goal,
      ambience,
      plannedMinutes: minutes,
    }).catch(() => null);

    setSessionId(session?.id ?? null);
    focusedSeconds.current = 0;
    setRemaining(minutes * 60);
    setRunning(true);
    setFinished(false);
    track('focus_session_started', { mode, minutes, ambience });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [mode, goal, ambience, minutes]);

  const finish = useCallback(
    async (completed: boolean) => {
      setRunning(false);
      if (sessionId) {
        await endSession({
          sessionId,
          focusedSeconds: focusedSeconds.current,
          breakSeconds: 0,
          cardsReviewed: 0,
          questionsAnswered: 0,
          completed,
        }).catch(() => undefined);
      }
      if (completed) track('focus_session_completed', { minutes: Math.round(focusedSeconds.current / 60) });
      setSessionId(null);
      router.back();
    },
    [sessionId, router],
  );

  const progress = 1 - remaining / Math.max(1, minutes * 60);

  /* --- setup ------------------------------------------------------------- */

  if (!running && !finished) {
    return (
      <Screen>
        <View style={styles.header}>
          <Button
            label=""
            variant="ghost"
            size="sm"
            accessibilityLabel={t('common.close')}
            icon={<Icon name="x" size={20} color="textSecondary" />}
            onPress={() => router.back()}
            style={styles.headerButton}
          />
          <Text variant="title2" style={styles.flex}>
            {t('focus.title')}
          </Text>
        </View>

        <View style={styles.form}>
          <Field
            value={goal}
            onChangeText={setGoal}
            placeholder={t('focus.goalPlaceholder')}
            maxLength={120}
          />

          <Segmented
            options={[
              { value: 'focus', label: t('focus.modeFocus') },
              { value: 'deep', label: t('focus.modeDeep') },
              { value: 'quick_review', label: t('focus.modeQuick') },
              { value: 'exam_prep', label: t('focus.modeExam') },
            ]}
            value={mode}
            onChange={setMode}
          />

          <View style={styles.section}>
            <Text variant="captionStrong" color="textSecondary">
              {t('focus.duration')}
            </Text>
            <View style={styles.durations}>
              {DURATIONS.map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: minutes === value }}
                  accessibilityLabel={t('common.minutes', { count: value })}
                  onPress={() => {
                    setMinutes(value);
                    setRemaining(value * 60);
                    setPreference('sessionMinutes', value);
                  }}
                  style={[
                    styles.duration,
                    {
                      backgroundColor: minutes === value ? theme.colors.accentSurface : theme.colors.fill,
                      borderColor: minutes === value ? theme.colors.accent : 'transparent',
                      borderWidth: minutes === value ? 1.5 : 0,
                    },
                  ]}
                >
                  <Text variant="title3" color={minutes === value ? 'accent' : 'text'}>
                    {value}
                  </Text>
                  <Text variant="micro" color="textTertiary">
                    min
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text variant="captionStrong" color="textSecondary">
              {t('focus.ambience')}
            </Text>
            <View style={styles.ambience}>
              {AMBIENCE.map((option) => (
                <Chip
                  key={option.key}
                  label={t(option.labelKey as never)}
                  selected={ambience === option.key}
                  onPress={() => {
                    setAmbience(option.key);
                    setPreference('ambience', option.key);
                  }}
                />
              ))}
            </View>
            {ambience !== 'none' ? (
              // Honest about what this build does: atmosphere, not audio.
              <Text variant="micro" color="textTertiary">
                Sets the visual atmosphere. Ambient audio is not included in this build.
              </Text>
            ) : null}
          </View>
        </View>

        <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Button label={t('focus.start')} size="lg" fullWidth onPress={() => void start()} />
        </View>
      </Screen>
    );
  }

  /* --- running / finished ------------------------------------------------ */

  return (
    <Screen padded={false}>
      <AmbienceBackdrop ambience={ambience} />

      <View style={[styles.session, { paddingTop: insets.top + spacing.xxl }]}>
        <ProgressRing value={progress} size={220} strokeWidth={5}>
          <View style={styles.timerBody}>
            <Text variant="display" style={styles.timer}>
              {formatClock(remaining)}
            </Text>
            {goal ? (
              <Text variant="caption" color="textSecondary" align="center" numberOfLines={2}>
                {goal}
              </Text>
            ) : null}
          </View>
        </ProgressRing>

        {finished ? (
          <View style={styles.finished}>
            <Text variant="title2" align="center">
              {t('focus.sessionSummary')}
            </Text>
            <Text variant="callout" color="textSecondary" align="center">
              {t('focus.sessionSummaryBody', {
                minutes: Math.round(finalSeconds / 60),
                cards: 0,
                questions: 0,
              })}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.sessionActions, { paddingBottom: insets.bottom + spacing.lg }]}>
        {finished ? (
          <Button label={t('common.done')} size="lg" fullWidth onPress={() => void finish(true)} />
        ) : (
          <>
            <Button
              label={running ? t('capture.pause') : t('focus.resumeSession')}
              variant="secondary"
              size="lg"
              fullWidth
              onPress={() => setRunning((v) => !v)}
            />
            <Button
              label={t('focus.endSession')}
              variant="ghost"
              fullWidth
              onPress={() => void finish(false)}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

/** A slow, low-contrast gradient. Atmosphere that never competes with the timer. */
function AmbienceBackdrop({ ambience }: { ambience: AmbienceKey }) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const drift = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion || ambience === 'none') return;
    drift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 9000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, [drift, reduceMotion, ambience]);

  const style = useAnimatedStyle(() => ({ opacity: 0.35 + drift.value * 0.25 }));

  if (ambience === 'none') return null;

  const tint = AMBIENCE_TINTS[ambience] ?? theme.colors.accent;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <LinearGradient
        colors={[tint + '30', 'transparent', tint + '18']}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

const AMBIENCE_TINTS: Record<AmbienceKey, string> = {
  none: '#000000',
  rain: '#4A90AE',
  library: '#9C5C08',
  fireplace: '#C1541A',
  cafe: '#8A6A3F',
  ocean: '#2C6E8F',
  night: '#3B4C7A',
  forest: '#47632C',
};

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  headerButton: { width: 40, paddingHorizontal: 0 },
  form: { flex: 1, gap: spacing.xl, marginTop: spacing.lg },
  section: { gap: spacing.md },
  durations: { flexDirection: 'row', gap: spacing.sm },
  duration: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    minHeight: 64,
  },
  ambience: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actions: { gap: spacing.sm },

  session: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xxl },
  timerBody: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg },
  timer: { fontVariant: ['tabular-nums'] },
  finished: { gap: spacing.sm, paddingHorizontal: spacing.xl },
  sessionActions: { paddingHorizontal: spacing.lg, gap: spacing.sm },
});
