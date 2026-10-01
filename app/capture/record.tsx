import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, Button, Field, Icon, Screen, Sheet, Text } from '../../src/components';
import { t } from '../../src/i18n';
import { useAsyncAction } from '../../src/hooks/useAsyncAction';
import { track } from '../../src/services/analytics';
import { useUploadSource } from '../../src/services/sources';
import { useReduceMotion, useTheme } from '../../src/theme/ThemeProvider';
import { motion, space as spacing } from '../../src/theme/tokens';

/**
 * Live recording.
 *
 * The rules that shape this screen:
 *  - Audio is never lost. A stop always produces a file before anything else
 *    happens, and an interruption (call, another app) is surfaced rather than
 *    silently swallowed.
 *  - Discarding is the only destructive action and it always confirms.
 *  - The consent notice is shown before the first tap, not buried in a policy.
 */
export default function Record() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const params = useLocalSearchParams<{ spaceId?: string }>();

  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, 200);
  const upload = useUploadSource();

  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [title, setTitle] = useState('');

  const pulse = useSharedValue(1);

  /* --- permissions ------------------------------------------------------ */

  useEffect(() => {
    void (async () => {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      setPermission(status.granted ? 'granted' : 'denied');
      if (status.granted) {
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      }
    })();
  }, []);

  /* --- interruption ------------------------------------------------------ */

  useEffect(() => {
    // A recorder that stops reporting `isRecording` while we believe we are
    // recording means something took the microphone. Tell the student rather
    // than letting them keep talking to a dead mic.
    if (started && !paused && !recorderState.isRecording && recorderState.durationMillis > 0) {
      setInterrupted(true);
    }
  }, [started, paused, recorderState.isRecording, recorderState.durationMillis]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background' && started && !paused) {
        // iOS keeps recording with the audio background mode; this is a hint,
        // not a stop, so the lecture is not cut short by a glance at a message.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [started, paused]);

  /* --- level meter ------------------------------------------------------- */

  useEffect(() => {
    if (reduceMotion || !recorderState.isRecording) {
      pulse.value = withTiming(1, { duration: motion.duration.base });
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 900 }),
        withTiming(1, { duration: 900 }),
      ),
      -1,
      true,
    );
  }, [recorderState.isRecording, reduceMotion, pulse]);

  // metering is dBFS (negative); map roughly to 0..1
  const level = useMemo(() => {
    const metering = recorderState.metering;
    if (metering === undefined) return 0;
    return Math.max(0, Math.min(1, (metering + 60) / 60));
  }, [recorderState.metering]);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value * (1 + level * 0.18) }],
    opacity: 0.18 + level * 0.3,
  }));

  /* --- controls ---------------------------------------------------------- */

  const start = useAsyncAction(async () => {
    await recorder.prepareToRecordAsync();
    recorder.record();
    setStarted(true);
    setPaused(false);
    setInterrupted(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    track('recording_started');
  });

  const togglePause = useCallback(() => {
    if (paused) {
      recorder.record();
      setPaused(false);
    } else {
      recorder.pause();
      setPaused(true);
    }
    Haptics.selectionAsync().catch(() => {});
  }, [paused, recorder]);

  const finish = useAsyncAction(async () => {
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri || !params.spaceId) {
      throw new Error('Recording could not be saved.');
    }

    track('recording_completed', { duration_ms: recorderState.durationMillis });

    const source = await upload.mutateAsync({
      spaceId: params.spaceId,
      uri,
      title: title.trim() || defaultTitle(),
      kind: 'recording',
      mimeType: 'audio/m4a',
      durationMs: recorderState.durationMillis,
    });

    router.replace({ pathname: '/source/[id]', params: { id: source.id } });
  });

  const discard = useCallback(async () => {
    if (started) {
      try {
        await recorder.stop();
      } catch {
        // already stopped; nothing to clean up
      }
    }
    track('recording_discarded');
    router.back();
  }, [started, recorder, router]);

  /* --- render ------------------------------------------------------------ */

  if (permission === 'denied') {
    return (
      <Screen>
        <View style={styles.denied}>
          <Icon name="mic-off" size={28} color="danger" />
          <Text variant="title3" align="center">
            {t('capture.micDenied')}
          </Text>
          <Text variant="callout" color="textSecondary" align="center">
            {t('capture.micDeniedBody')}
          </Text>
          <Button
            label={t('capture.openSettings')}
            onPress={() => void Linking.openSettings()}
            style={styles.deniedAction}
          />
          <Button label={t('common.cancel')} variant="ghost" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const elapsed = formatDuration(recorderState.durationMillis);

  return (
    <>
      <Screen>
        <View style={styles.header}>
          <Button
            label=""
            variant="ghost"
            size="sm"
            accessibilityLabel={t('common.close')}
            icon={<Icon name="x" size={20} color="textSecondary" />}
            onPress={() => (started ? setDiscardOpen(true) : router.back())}
          />
        </View>

        {interrupted ? (
          <Banner
            tone="warning"
            title={t('capture.interrupted')}
            message={t('capture.interruptedBody')}
            actionLabel={t('capture.finish')}
            onAction={() => void finish.run()}
          />
        ) : null}

        {finish.error ? (
          <Banner tone="danger" title={finish.error.message} style={styles.banner} />
        ) : null}

        <View style={styles.stage}>
          <View style={styles.orbWrap}>
            <Animated.View
              style={[styles.halo, { backgroundColor: theme.colors.accent }, haloStyle]}
            />
            <View
              style={[
                styles.orb,
                {
                  backgroundColor: recorderState.isRecording
                    ? theme.colors.accent
                    : theme.colors.fill,
                },
              ]}
            >
              <Icon
                name="mic"
                size={34}
                tint={recorderState.isRecording ? theme.colors.onAccent : theme.colors.textTertiary}
              />
            </View>
          </View>

          <Text variant="display" style={styles.timer} accessibilityLabel={`Elapsed ${elapsed}`}>
            {elapsed}
          </Text>

          <Text variant="caption" color={paused ? 'warning' : 'textTertiary'}>
            {!started
              ? t('capture.record')
              : paused
                ? t('capture.paused')
                : t('capture.recording')}
          </Text>
        </View>

        {started ? (
          <Field
            value={title}
            onChangeText={setTitle}
            placeholder={t('capture.titlePlaceholder')}
            containerStyle={styles.titleField}
            maxLength={120}
          />
        ) : (
          <View style={styles.consent}>
            <Icon name="info" size={14} color="textTertiary" />
            <Text variant="caption" color="textTertiary" style={styles.consentText}>
              {t('capture.consentNotice')}
            </Text>
          </View>
        )}

        <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.lg }]}>
          {!started ? (
            <Button
              label={t('capture.record')}
              size="lg"
              fullWidth
              loading={start.loading}
              disabled={permission !== 'granted' || !params.spaceId}
              icon={<Icon name="mic" size={18} tint={theme.colors.onAccent} />}
              onPress={() => void start.run()}
            />
          ) : (
            <>
              <View style={styles.controlRow}>
                <Button
                  label={paused ? t('capture.resume') : t('capture.pause')}
                  variant="secondary"
                  size="lg"
                  onPress={togglePause}
                  style={styles.flex}
                  icon={<Icon name={paused ? 'play' : 'pause'} size={18} color="text" />}
                />
                <Button
                  label={t('capture.finish')}
                  size="lg"
                  loading={finish.loading}
                  onPress={() => void finish.run()}
                  style={styles.flex}
                  icon={<Icon name="check" size={18} tint={theme.colors.onAccent} />}
                />
              </View>
              <Button
                label={t('capture.discard')}
                variant="ghost"
                onPress={() => setDiscardOpen(true)}
              />
            </>
          )}
        </View>
      </Screen>

      <Sheet
        visible={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title={t('capture.discardConfirm')}
        dismissible
      >
        <View style={styles.sheet}>
          <Text variant="callout" color="textSecondary">
            {t('capture.discardConfirmBody')}
          </Text>
          <Button
            label={t('capture.discard')}
            variant="danger"
            fullWidth
            onPress={() => void discard()}
          />
          <Button
            label={t('common.cancel')}
            variant="ghost"
            fullWidth
            onPress={() => setDiscardOpen(false)}
          />
        </View>
      </Sheet>
    </>
  );
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function defaultTitle(): string {
  const now = new Date();
  return `Recording · ${now.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.sm },
  banner: { marginTop: spacing.sm },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.base },
  orbWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  halo: { position: 'absolute', width: 180, height: 180, borderRadius: 90 },
  orb: {
    width: 116,
    height: 116,
    borderRadius: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timer: { fontVariant: ['tabular-nums'] },
  titleField: { marginBottom: spacing.lg },
  consent: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  consentText: { flex: 1 },
  controls: { gap: spacing.sm },
  controlRow: { flexDirection: 'row', gap: spacing.sm },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  deniedAction: { marginTop: spacing.base, minWidth: 200 },
  sheet: { gap: spacing.md, paddingBottom: spacing.base },
});
