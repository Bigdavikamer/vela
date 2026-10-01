import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Badge,
  Card,
  EmptyState,
  Icon,
  ScrollScreen,
  Segmented,
  Skeleton,
  Text,
} from '../../src/components';
import { t } from '../../src/i18n';
import { touchSpace, useSpaces } from '../../src/services/spaces';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius, space as spacing } from '../../src/theme/tokens';

type SortKey = 'recent' | 'name' | 'due';

/**
 * Everything the student owns, plus the way into search.
 *
 * Organisation is by space, because that is how students already think about
 * their work. Sorting is offered; manual filing is not required.
 */
export default function Library() {
  const router = useRouter();
  const theme = useTheme();
  const spaces = useSpaces();
  const [sort, setSort] = useState<SortKey>('recent');

  const sorted = useMemo(() => {
    const list = [...(spaces.data ?? [])];
    switch (sort) {
      case 'name':
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case 'due':
        return list.sort((a, b) => b.dueCount - a.dueCount);
      default:
        return list;
    }
  }, [spaces.data, sort]);

  return (
    <ScrollScreen>
      <View style={styles.header}>
        <Text variant="title1">{t('library.title')}</Text>
      </View>

      {/* Search is a full screen rather than an inline field: it searches
          meaning across every space, and deserves the room. */}
      <Pressable
        accessibilityRole="search"
        accessibilityLabel={t('library.searchPlaceholder')}
        onPress={() => router.push('/search')}
        style={({ pressed }) => [
          styles.searchBar,
          {
            backgroundColor: theme.colors.fill,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <Icon name="search" size={18} color="textTertiary" />
        <Text variant="body" color="textTertiary">
          {t('library.searchPlaceholder')}
        </Text>
      </Pressable>

      {spaces.isLoading ? (
        <View style={styles.skeleton}>
          <Skeleton height={72} radius={radius.lg} />
          <Skeleton height={72} radius={radius.lg} />
          <Skeleton height={72} radius={radius.lg} />
        </View>
      ) : (spaces.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon="book-open"
          title={t('home.emptyTitle')}
          body={t('home.emptyBody')}
          actionLabel={t('home.emptyAction')}
          onAction={() => router.push('/capture')}
        />
      ) : (
        <>
          <Segmented
            options={[
              { value: 'recent', label: t('library.sortRecent') },
              { value: 'name', label: t('library.sortName') },
              { value: 'due', label: t('library.sortDue') },
            ]}
            value={sort}
            onChange={setSort}
            style={styles.sort}
          />

          <View style={styles.list}>
            {sorted.map((item) => {
              const accent = theme.spaceAccent(item.accent);
              return (
                <Card
                  key={item.id}
                  accent={accent}
                  accessibilityLabel={item.name}
                  onPress={() => {
                    void touchSpace(item.id);
                    router.push({ pathname: '/space/[id]', params: { id: item.id } });
                  }}
                  style={styles.card}
                >
                  <View style={styles.cardRow}>
                    <View style={styles.cardBody}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text variant="caption" color="textTertiary">
                        {t('space.sourceCount', { count: item.sourceCount })}
                      </Text>
                    </View>
                    {item.dueCount > 0 ? (
                      <Badge label={t('cards.due', { count: item.dueCount })} tint={accent} />
                    ) : null}
                    <Icon name="chevron-right" size={18} color="textTertiary" />
                  </View>
                </Card>
              );
            })}
          </View>
        </>
      )}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.base, marginBottom: spacing.base },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 46,
    paddingHorizontal: spacing.base,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  sort: { marginBottom: spacing.base },
  list: { gap: spacing.sm },
  card: { paddingLeft: spacing.lg },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardBody: { flex: 1, gap: 2 },
  skeleton: { gap: spacing.sm },
});
