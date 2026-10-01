import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Banner,
  Button,
  Field,
  Icon,
  NoteSkeleton,
  ScrollScreen,
  Sheet,
  Text,
} from '../../../src/components';
import { NoteBlockView } from '../../../src/components/NoteBlocks';
import { ProcessingView } from '../../../src/components/ProcessingView';
import { t } from '../../../src/i18n';
import { useAsyncAction } from '../../../src/hooks/useAsyncAction';
import { track } from '../../../src/services/analytics';
import {
  noteToMarkdown,
  useNoteForSource,
  useRefreshStale,
  useRewriteBlock,
  useStaleCount,
  useUpdateNoteBlock,
  type NoteBlock,
} from '../../../src/services/notes';
import { useRetrySource, useSource } from '../../../src/services/sources';
import { space as spacing } from '../../../src/theme/tokens';

/**
 * A single piece of material: processing while it runs, the study guide once
 * it is ready, and a real recovery path if it fails.
 */
export default function SourceScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const source = useSource(id);
  const note = useNoteForSource(id);
  const retry = useRetrySource();

  const noteId = note.data?.note.id;
  const stale = useStaleCount(noteId);
  const refreshStale = useRefreshStale();

  const updateBlock = useUpdateNoteBlock();
  const rewriteBlock = useRewriteBlock();

  const [editing, setEditing] = useState<NoteBlock | null>(null);
  const [draft, setDraft] = useState('');
  const [actionsFor, setActionsFor] = useState<NoteBlock | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (source.data?.status === 'ready') track('note_opened');
  }, [source.data?.status]);

  const status = source.data?.status;

  const retryAction = useAsyncAction(async () => {
    if (source.data) await retry.mutateAsync(source.data);
  });

  const refreshAction = useAsyncAction(async () => {
    if (noteId) {
      await refreshStale.mutateAsync(noteId);
      track('stale_refresh_accepted');
    }
  });

  const saveEdit = useAsyncAction(async () => {
    if (!editing) return;
    await updateBlock.mutateAsync({ blockId: editing.id, content: draft, term: editing.term });
    track('note_edited');
    setEditing(null);
    await note.refetch();
  });

  const rewriteAction = useAsyncAction(async (block: NoteBlock, instruction: string) => {
    await rewriteBlock.mutateAsync({ blockId: block.id, instruction });
    setActionsFor(null);
    await note.refetch();
  });

  const copyAll = useAsyncAction(async () => {
    if (!note.data) return;
    await Clipboard.setStringAsync(noteToMarkdown(note.data.note, note.data.blocks));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  });

  if (source.isLoading) {
    return (
      <ScrollScreen>
        <View style={styles.loading}>
          <NoteSkeleton />
        </View>
      </ScrollScreen>
    );
  }

  if (!source.data) {
    return (
      <ScrollScreen>
        <Header onBack={() => router.back()} title="" />
        <Banner tone="danger" title={t('errors.notFound')} message={t('errors.notFoundBody')} />
      </ScrollScreen>
    );
  }

  return (
    <>
      <ScrollScreen>
        <Header
          onBack={() => router.back()}
          title={source.data.title}
          onTranscript={
            source.data.kind === 'recording' ||
            source.data.kind === 'audio' ||
            source.data.kind === 'video'
              ? () =>
                  router.push({
                    pathname: '/source/[id]/transcript',
                    params: { id: source.data!.id },
                  })
              : undefined
          }
          onCopy={status === 'ready' ? () => void copyAll.run() : undefined}
          copied={copied}
        />

        {status === 'failed' ? (
          <Banner
            tone="danger"
            title={source.data.error_message ?? t('processing.failedTitle')}
            message={t('processing.failedBody')}
            actionLabel={t('common.retry')}
            onAction={() => void retryAction.run()}
          />
        ) : null}

        {status === 'processing' || status === 'queued' || status === 'uploading' ? (
          <ProcessingView
            kind={source.data.kind}
            stage={source.data.stage}
            progress={source.data.progress}
            title={source.data.title}
          />
        ) : null}

        {status === 'ready' && note.data ? (
          <>
            {(stale.data?.cards ?? 0) > 0 ? (
              <Banner
                tone="warning"
                title={t('note.staleTitle')}
                message={t('note.staleBody', { count: stale.data!.cards })}
                actionLabel={t('note.staleUpdate')}
                onAction={() => void refreshAction.run()}
                style={styles.staleBanner}
              />
            ) : null}

            {refreshAction.loading ? (
              <Banner tone="info" title={t('processing.materials')} style={styles.staleBanner} />
            ) : null}

            {note.data.note.summary ? (
              <View style={styles.summary}>
                <Text variant="callout" color="textSecondary">
                  {note.data.note.summary}
                </Text>
              </View>
            ) : null}

            <View style={styles.blocks}>
              {note.data.blocks.map((block) => (
                <NoteBlockView
                  key={block.id}
                  block={block}
                  onLongPress={(b) => setActionsFor(b)}
                  onPressSource={(b) => {
                    const segments = b.source_ref.segment_ids ?? [];
                    if (segments.length > 0) {
                      router.push({
                        pathname: '/source/[id]/transcript',
                        params: { id: source.data!.id, segment: segments[0] },
                      });
                    }
                  }}
                />
              ))}
            </View>

            <View style={styles.footer}>
              <Button
                label={t('cards.title')}
                variant="secondary"
                icon={<Icon name="layers" size={16} color="text" />}
                onPress={() =>
                  router.push({
                    pathname: '/review',
                    params: { spaceId: source.data!.space_id },
                  })
                }
              />
              <Button
                label={t('quiz.start')}
                variant="secondary"
                icon={<Icon name="help-circle" size={16} color="text" />}
                onPress={() =>
                  router.push({
                    pathname: '/quiz/new',
                    params: { spaceId: source.data!.space_id, sourceId: source.data!.id },
                  })
                }
              />
            </View>
          </>
        ) : null}

        {status === 'ready' && !note.data && !note.isLoading ? (
          <Banner
            tone="info"
            title={t('note.noTranscript')}
            message={t('processing.failedBody')}
            actionLabel={t('common.retry')}
            onAction={() => void retryAction.run()}
          />
        ) : null}
      </ScrollScreen>

      {/* Long-press actions on a block: the student stays in control of every
          line the model wrote. */}
      <Sheet
        visible={actionsFor !== null}
        onClose={() => setActionsFor(null)}
        title={t('common.edit')}
      >
        <View style={styles.sheet}>
          <Button
            label={t('common.edit')}
            variant="secondary"
            fullWidth
            icon={<Icon name="edit-2" size={16} color="text" />}
            onPress={() => {
              if (actionsFor) {
                setDraft(actionsFor.content);
                setEditing(actionsFor);
                setActionsFor(null);
              }
            }}
          />
          <Button
            label={t('note.regenerateBlock')}
            variant="secondary"
            fullWidth
            loading={rewriteAction.loading}
            icon={<Icon name="refresh-cw" size={16} color="text" />}
            onPress={() => {
              if (actionsFor) void rewriteAction.run(actionsFor, 'Rewrite it more clearly.');
            }}
          />
          <Button
            label="Simplify"
            variant="secondary"
            fullWidth
            onPress={() => {
              if (actionsFor) void rewriteAction.run(actionsFor, 'Explain it more simply.');
            }}
          />
          <Button
            label={t('common.cancel')}
            variant="ghost"
            fullWidth
            onPress={() => setActionsFor(null)}
          />
        </View>
      </Sheet>

      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={t('note.editing')}>
        <View style={styles.sheet}>
          <Field
            value={draft}
            onChangeText={setDraft}
            multiline
            multilineMinHeight={160}
            autoFocus
          />
          {saveEdit.error ? <Banner tone="danger" title={saveEdit.error.message} /> : null}
          <Text variant="caption" color="textTertiary">
            {t('note.staleBody', { count: stale.data?.cards ?? 0 })}
          </Text>
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

function Header({
  onBack,
  title,
  onTranscript,
  onCopy,
  copied,
}: {
  onBack: () => void;
  title: string;
  onTranscript?: () => void;
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
      <Text variant="captionStrong" color="textSecondary" numberOfLines={1} style={styles.headerTitle}>
        {title}
      </Text>
      {onTranscript ? (
        <Button
          label=""
          variant="ghost"
          size="sm"
          accessibilityLabel={t('note.transcript')}
          icon={<Icon name="align-left" size={18} color="textSecondary" />}
          onPress={onTranscript}
          style={styles.headerButton}
        />
      ) : null}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    marginBottom: spacing.base,
  },
  headerButton: { width: 40, paddingHorizontal: 0 },
  headerTitle: { flex: 1 },
  loading: { marginTop: spacing.xl },
  staleBanner: { marginBottom: spacing.base },
  summary: { marginBottom: spacing.lg },
  blocks: { marginTop: spacing.sm },
  footer: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  sheet: { gap: spacing.sm, paddingBottom: spacing.base },
});
