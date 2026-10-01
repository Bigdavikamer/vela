import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Banner, Button, EmptyState, Field, Icon, Screen, Sheet, Text } from '../../../src/components';
import { t } from '../../../src/i18n';
import { useAsyncAction } from '../../../src/hooks/useAsyncAction';
import { track } from '../../../src/services/analytics';
import {
  formatTimestamp,
  transcriptToText,
  useEditSegment,
  useTranscript,
  type TranscriptSegment,
} from '../../../src/services/notes';
import { getPlaybackUrl, useSource } from '../../../src/services/sources';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { radius, space as spacing } from '../../../src/theme/tokens';

/**
 * The transcript.
 *
 * This is the trust surface: any claim in the study guide can be traced back to
 * the exact moment it came from, and played. Segments are editable, and an edit
 * never destroys the machine original.
 */
export default function Transcript() {
  const router = useRouter();
  const theme = useTheme();
  const { id, segment, at } = useLocalSearchParams<{ id: string; segment?: string; at?: string }>();

  const source = useSource(id);
  const transcript = useTranscript(id);
  const editSegment = useEditSegment();

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<TranscriptSegment | null>(null);
  const [draft, setDraft] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});

  const player = useAudioPlayer(audioUrl ? { uri: audioUrl } : undefined);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    track('transcript_opened');
  }, []);

  // Signed URL, not a public one: a lecture recording stays private.
  useEffect(() => {
    if (!source.data?.storage_path) return;
    void getPlaybackUrl(source.data.storage_path).then(setAudioUrl);
  }, [source.data?.storage_path]);

  // Memoised so the useMemo/useEffect below do not see a new array identity
  // on every render.
  const segments = useMemo(() => transcript.data?.segments ?? [], [transcript.data]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return segments;
    return segments.filter((s) => s.text.toLowerCase().includes(needle));
  }, [segments, query]);

  // Deep link from a note citation or a search hit.
  useEffect(() => {
    if (!segment && !at) return;
    const target = segment
      ? segments.find((s) => s.id === segment)
      : segments.find((s) => s.start_ms >= Number(at ?? 0));
    if (!target) return;
    const offset = offsets.current[target.id];
    if (offset !== undefined) {
      scrollRef.current?.scrollTo({ y: Math.max(0, offset - 100), animated: true });
    }
  }, [segment, at, segments]);

  const playFrom = (startMs: number) => {
    if (!audioUrl) return;
    player.seekTo(startMs / 1000);
    player.play();
  };

  const saveEdit = useAsyncAction(async () => {
    if (!editing) return;
    await editSegment.mutateAsync({ segment: editing, text: draft });
    setEditing(null);
  });

  const copyAll = useAsyncAction(async () => {
    await Clipboard.setStringAsync(transcriptToText(segments));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  });

  if (transcript.isLoading) {
    return (
      <Screen>
        <Header onBack={() => router.back()} />
        <View style={styles.center}>
          <Text variant="callout" color="textTertiary">
            {t('common.loading')}
          </Text>
        </View>
      </Screen>
    );
  }

  if (segments.length === 0) {
    return (
      <Screen>
        <Header onBack={() => router.back()} />
        <EmptyState
          icon="align-left"
          title={t('note.noTranscript')}
          body={t('space.emptyBody')}
        />
      </Screen>
    );
  }

  return (
    <>
      <Screen>
        <Header
          onBack={() => router.back()}
          onCopy={() => void copyAll.run()}
          copied={copied}
        />

        <Field
          value={query}
          onChangeText={setQuery}
          placeholder={t('note.searchTranscript')}
          icon="search"
          autoCorrect={false}
          containerStyle={styles.search}
        />

        {query.trim() && filtered.length === 0 ? (
          <Banner tone="info" title={t('library.noResults')} />
        ) : null}

        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {filtered.map((item) => {
            const playing =
              status.playing &&
              status.currentTime * 1000 >= item.start_ms &&
              status.currentTime * 1000 < item.end_ms;

            return (
              <Pressable
                key={item.id}
                onLayout={(e) => {
                  offsets.current[item.id] = e.nativeEvent.layout.y;
                }}
                onLongPress={() => {
                  setDraft(item.text);
                  setEditing(item);
                }}
                delayLongPress={350}
                accessibilityHint="Long press to correct this line"
                style={[
                  styles.segment,
                  playing ? { backgroundColor: theme.colors.accentSurface } : null,
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t('note.jumpToAudio')} ${formatTimestamp(item.start_ms)}`}
                  onPress={() => playFrom(item.start_ms)}
                  disabled={!audioUrl}
                  hitSlop={8}
                  style={styles.timestamp}
                >
                  <Text variant="micro" color={audioUrl ? 'accent' : 'textTertiary'}>
                    {formatTimestamp(item.start_ms)}
                  </Text>
                </Pressable>

                <View style={styles.segmentBody}>
                  {item.speaker ? (
                    <Text variant="micro" color="textTertiary">
                      {item.speaker}
                    </Text>
                  ) : null}
                  <Text variant="reading" selectable>
                    {highlight(item.text, query)}
                  </Text>
                  {item.edited_at ? (
                    <Text variant="micro" color="textTertiary">
                      {t('note.yourEdit')}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {audioUrl ? (
          <View style={[styles.player, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <Button
              label=""
              variant="ghost"
              accessibilityLabel={status.playing ? t('capture.pause') : t('note.jumpToAudio')}
              icon={<Icon name={status.playing ? 'pause' : 'play'} size={20} color="accent" />}
              onPress={() => (status.playing ? player.pause() : player.play())}
              style={styles.playerButton}
            />
            <Text variant="caption" color="textSecondary" style={styles.flex}>
              {formatTimestamp((status.currentTime ?? 0) * 1000)}
            </Text>
          </View>
        ) : null}
      </Screen>

      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={t('note.editing')}>
        <View style={styles.sheet}>
          <Field value={draft} onChangeText={setDraft} multiline multilineMinHeight={120} autoFocus />
          {saveEdit.error ? <Banner tone="danger" title={saveEdit.error.message} /> : null}
          <Button
            label={t('common.save')}
            fullWidth
            loading={saveEdit.loading}
            onPress={() => void saveEdit.run()}
          />
        </View>
      </Sheet>
    </>
  );
}

/** Wraps matches so a search result is findable on the line, not just in it. */
function highlight(text: string, query: string): React.ReactNode {
  const needle = query.trim();
  if (!needle) return text;

  const parts = text.split(new RegExp(`(${escapeRegExp(needle)})`, 'ig'));
  return parts.map((part, i) =>
    part.toLowerCase() === needle.toLowerCase() ? (
      <Text key={i} variant="reading" color="accent">
        {part}
      </Text>
    ) : (
      part
    ),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function Header({
  onBack,
  onCopy,
  copied,
}: {
  onBack: () => void;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <View style={styles.header}>
      <Button
        label=""
        variant="ghost"
        size="sm"
        accessibilityLabel={t('common.back')}
        icon={<Icon name="arrow-left" size={20} color="textSecondary" />}
        onPress={onBack}
        style={styles.headerButton}
      />
      <Text variant="captionStrong" color="textSecondary" style={styles.flex}>
        {t('note.transcript')}
      </Text>
      {onCopy ? (
        <Button
          label=""
          variant="ghost"
          size="sm"
          accessibilityLabel={t('note.copyAll')}
          icon={<Icon name={copied ? 'check' : 'copy'} size={18} color={copied ? 'success' : 'textSecondary'} />}
          onPress={onCopy}
          style={styles.headerButton}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    marginBottom: spacing.base,
  },
  headerButton: { width: 40, paddingHorizontal: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  search: { marginBottom: spacing.base },
  list: { paddingBottom: spacing.xxl, gap: spacing.xs },
  segment: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  timestamp: { width: 52, paddingTop: 3 },
  segmentBody: { flex: 1, gap: 2 },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    marginBottom: spacing.sm,
  },
  playerButton: { width: 44, paddingHorizontal: 0 },
  sheet: { gap: spacing.md, paddingBottom: spacing.base },
});
