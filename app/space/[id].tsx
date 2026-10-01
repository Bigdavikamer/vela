import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  Icon,
  MasteryMeter,
  ProgressBar,
  ScrollScreen,
  Segmented,
  Sheet,
  Skeleton,
  Text,
} from '../../src/components';
import { t } from '../../src/i18n';
import { useAsyncAction } from '../../src/hooks/useAsyncAction';
import { useConcepts } from '../../src/services/concepts';
import { useQuizSets } from '../../src/services/quizzes';
import { useDecks } from '../../src/services/review';
import {
  kindIcon,
  kindLabel,
  useDeleteSource,
  useRetrySource,
  useSources,
  type Source,
} from '../../src/services/sources';
import { useDeleteSpace, useSpace } from '../../src/services/spaces';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius, space as spacing } from '../../src/theme/tokens';
import { stageLabel } from '../(tabs)/index';

type Tab = 'material' | 'cards' | 'quizzes' | 'concepts';

/**
 * A study space: everything for one subject in one place.
 *
 * This is the unit the tutor reasons across, so it is also the unit the
 * interface is organised around — material, the cards and quizzes built from
 * it, and the concepts it teaches.
 */
export default function SpaceScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const space = useSpace(id);
  const sources = useSources(id);
  const decks = useDecks(id);
  const quizzes = useQuizSets(id);
  const concepts = useConcepts(id);

  const retry = useRetrySource();
  const deleteSource = useDeleteSource();
  const deleteSpace = useDeleteSpace();

  const [tab, setTab] = useState<Tab>('material');
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sourceMenu, setSourceMenu] = useState<Source | null>(null);

  const accent = space.data ? theme.spaceAccent(space.data.accent) : theme.colors.accent;

  const removeSpace = useAsyncAction(async () => {
    if (!id) return;
    await deleteSpace.mutateAsync(id);
    router.replace('/(tabs)');
  });

  const removeSource = useAsyncAction(async (source: Source) => {
    await deleteSource.mutateAsync(source);
    setSourceMenu(null);
  });

  if (space.isLoading) {
    return (
      <ScrollScreen>
        <View style={styles.skeleton}>
          <Skeleton width="55%" height={28} />
          <Skeleton height={64} radius={radius.lg} />
          <Skeleton height={64} radius={radius.lg} />
        </View>
      </ScrollScreen>
    );
  }

  if (!space.data) {
    return (
      <ScrollScreen>
        <Banner tone="danger" title={t('errors.notFound')} message={t('errors.notFoundBody')} />
      </ScrollScreen>
    );
  }

  const totalDue = (decks.data ?? []).reduce((sum, d) => sum + d.dueCount, 0);
  const readySources = (sources.data ?? []).filter((s) => s.status === 'ready');

  return (
    <>
      <ScrollScreen>
        <View style={styles.header}>
          <Button
            label=""
            variant="ghost"
            size="sm"
            accessibilityLabel={t('common.back')}
            icon={<Icon name="arrow-left" size={20} color="textSecondary" />}
            onPress={() => router.back()}
            style={styles.headerButton}
          />
          <View style={styles.flex} />
          <Button
            label=""
            variant="ghost"
            size="sm"
            accessibilityLabel={t('common.settings')}
            icon={<Icon name="more-horizontal" size={20} color="textSecondary" />}
            onPress={() => setMenuOpen(true)}
            style={styles.headerButton}
          />
        </View>

        <View style={styles.title}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <Text variant="title1" numberOfLines={2} style={styles.flex}>
            {space.data.name}
          </Text>
        </View>

        <View style={styles.quickActions}>
          <Button
            label={t('tutor.title')}
            variant="secondary"
            icon={<Icon name="message-circle" size={16} color="text" />}
            onPress={() => router.push({ pathname: '/tutor/[spaceId]', params: { spaceId: id! } })}
            style={styles.flex}
          />
          <Button
            label={totalDue > 0 ? t('cards.due', { count: totalDue }) : t('cards.review')}
            variant={totalDue > 0 ? 'primary' : 'secondary'}
            icon={
              <Icon
                name="layers"
                size={16}
                tint={totalDue > 0 ? theme.colors.onAccent : theme.colors.text}
              />
            }
            onPress={() => router.push({ pathname: '/review', params: { spaceId: id! } })}
            style={styles.flex}
          />
        </View>

        <Segmented
          options={[
            { value: 'material', label: t('space.material') },
            { value: 'cards', label: t('space.cards') },
            { value: 'quizzes', label: t('space.quizzes') },
            { value: 'concepts', label: t('space.concepts') },
          ]}
          value={tab}
          onChange={setTab}
          style={styles.tabs}
        />

        {tab === 'material' ? (
          (sources.data ?? []).length === 0 ? (
            <EmptyState
              icon="inbox"
              title={t('space.emptyTitle')}
              body={t('space.emptyBody')}
              actionLabel={t('space.addMaterial')}
              onAction={() => router.push({ pathname: '/capture', params: { spaceId: id! } })}
            />
          ) : (
            <View style={styles.list}>
              {(sources.data ?? []).map((source) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  onPress={() => router.push({ pathname: '/source/[id]', params: { id: source.id } })}
                  onLongPress={() => setSourceMenu(source)}
                  onRetry={() => void retry.mutateAsync(source)}
                />
              ))}
              <Button
                label={t('space.addMaterial')}
                variant="secondary"
                fullWidth
                icon={<Icon name="plus" size={16} color="text" />}
                onPress={() => router.push({ pathname: '/capture', params: { spaceId: id! } })}
                style={styles.addButton}
              />
            </View>
          )
        ) : null}

        {tab === 'cards' ? (
          (decks.data ?? []).length === 0 ? (
            <EmptyState
              icon="layers"
              title={t('cards.noneDue')}
              body={t('space.emptyBody')}
              actionLabel={t('space.addMaterial')}
              onAction={() => router.push({ pathname: '/capture', params: { spaceId: id! } })}
            />
          ) : (
            <View style={styles.list}>
              {(decks.data ?? []).map((deck) => (
                <Card
                  key={deck.id}
                  onPress={() => router.push({ pathname: '/review', params: { spaceId: id! } })}
                  style={styles.row}
                >
                  <Icon name="layers" size={18} color="textSecondary" />
                  <View style={styles.rowBody}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {deck.title}
                    </Text>
                    <Text variant="caption" color="textTertiary">
                      {deck.cardCount} cards
                    </Text>
                  </View>
                  {deck.dueCount > 0 ? <Badge label={`${deck.dueCount}`} tint={accent} /> : null}
                </Card>
              ))}
            </View>
          )
        ) : null}

        {tab === 'quizzes' ? (
          <View style={styles.list}>
            <Button
              label={t('quiz.start')}
              fullWidth
              icon={<Icon name="help-circle" size={16} tint={theme.colors.onAccent} />}
              onPress={() => router.push({ pathname: '/quiz/new', params: { spaceId: id! } })}
              disabled={readySources.length === 0}
            />
            {(quizzes.data ?? []).map((quiz) => (
              <Card
                key={quiz.id}
                onPress={() => router.push({ pathname: '/quiz/[id]', params: { id: quiz.id } })}
                style={styles.row}
              >
                <Icon name="help-circle" size={18} color="textSecondary" />
                <View style={styles.rowBody}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {quiz.title}
                  </Text>
                  <Text variant="caption" color="textTertiary">
                    {quiz.question_count} questions
                  </Text>
                </View>
                <Icon name="chevron-right" size={18} color="textTertiary" />
              </Card>
            ))}
          </View>
        ) : null}

        {tab === 'concepts' ? (
          (concepts.data ?? []).length === 0 ? (
            <EmptyState
              icon="git-branch"
              title={t('space.emptyTitle')}
              body={t('space.emptyBody')}
            />
          ) : (
            <View style={styles.list}>
              {(concepts.data ?? []).map((concept) => (
                <Card key={concept.id} style={styles.concept}>
                  <View style={styles.conceptHeader}>
                    <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
                      {concept.name}
                    </Text>
                    <MasteryMeter
                      value={concept.mastery}
                      label={concept.mastery_updated_at ? undefined : 'Not started'}
                    />
                  </View>
                  {concept.definition ? (
                    <Text variant="caption" color="textSecondary" numberOfLines={3}>
                      {concept.definition}
                    </Text>
                  ) : null}
                </Card>
              ))}
            </View>
          )
        ) : null}
      </ScrollScreen>

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={space.data.name}>
        <View style={styles.sheet}>
          <Button
            label={t('space.addMaterial')}
            variant="secondary"
            fullWidth
            onPress={() => {
              setMenuOpen(false);
              router.push({ pathname: '/capture', params: { spaceId: id! } });
            }}
          />
          <Button
            label={t('exam.addExam')}
            variant="secondary"
            fullWidth
            onPress={() => {
              setMenuOpen(false);
              router.push({ pathname: '/exam/new', params: { spaceId: id! } });
            }}
          />
          <Button
            label={t('space.deleteSpace')}
            variant="danger"
            fullWidth
            onPress={() => {
              setMenuOpen(false);
              setConfirmDelete(true);
            }}
          />
        </View>
      </Sheet>

      <Sheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('space.deleteSpaceConfirm', { name: space.data.name })}
      >
        <View style={styles.sheet}>
          <Text variant="callout" color="textSecondary">
            {t('space.deleteSpaceConfirmBody')}
          </Text>
          {removeSpace.error ? <Banner tone="danger" title={removeSpace.error.message} /> : null}
          <Button
            label={t('common.delete')}
            variant="danger"
            fullWidth
            loading={removeSpace.loading}
            onPress={() => void removeSpace.run()}
          />
          <Button
            label={t('common.cancel')}
            variant="ghost"
            fullWidth
            onPress={() => setConfirmDelete(false)}
          />
        </View>
      </Sheet>

      <Sheet
        visible={sourceMenu !== null}
        onClose={() => setSourceMenu(null)}
        title={sourceMenu?.title ?? ''}
      >
        <View style={styles.sheet}>
          <Button
            label={t('common.delete')}
            variant="danger"
            fullWidth
            loading={removeSource.loading}
            onPress={() => {
              if (sourceMenu) void removeSource.run(sourceMenu);
            }}
          />
          <Button
            label={t('common.cancel')}
            variant="ghost"
            fullWidth
            onPress={() => setSourceMenu(null)}
          />
        </View>
      </Sheet>
    </>
  );
}

function SourceRow({
  source,
  onPress,
  onLongPress,
  onRetry,
}: {
  source: Source;
  onPress: () => void;
  onLongPress: () => void;
  onRetry: () => void;
}) {
  const busy = source.status === 'processing' || source.status === 'queued' || source.status === 'uploading';

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350}>
      <Card style={styles.sourceCard}>
        <View style={styles.row}>
          <Icon name={kindIcon(source.kind)} size={18} color="textSecondary" />
          <View style={styles.rowBody}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {source.title}
            </Text>
            <Text
              variant="caption"
              color={source.status === 'failed' ? 'danger' : 'textTertiary'}
              numberOfLines={1}
            >
              {source.status === 'failed'
                ? (source.error_message ?? t('processing.failedTitle'))
                : busy
                  ? stageLabel(source.stage)
                  : kindLabel(source.kind)}
            </Text>
          </View>
          {source.status === 'failed' ? (
            <Button label={t('common.retry')} variant="ghost" size="sm" onPress={onRetry} />
          ) : (
            <Icon name="chevron-right" size={18} color="textTertiary" />
          )}
        </View>

        {busy ? (
          <ProgressBar
            value={source.progress / 100}
            height={3}
            label={stageLabel(source.stage)}
            style={styles.sourceProgress}
          />
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  headerButton: { width: 40, paddingHorizontal: 0 },
  title: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  dot: { width: 12, height: 12, borderRadius: 6 },
  quickActions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  tabs: { marginBottom: spacing.lg },
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowBody: { flex: 1, gap: 2 },
  sourceCard: { gap: spacing.sm },
  sourceProgress: { marginTop: spacing.xs },
  addButton: { marginTop: spacing.sm },
  concept: { gap: spacing.sm },
  conceptHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sheet: { gap: spacing.sm, paddingBottom: spacing.base },
  skeleton: { gap: spacing.base, marginTop: spacing.xl },
});
