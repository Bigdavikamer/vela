import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Banner, Button, Card, EmptyState, Field, Icon, Screen, Text } from '../src/components';
import { t } from '../src/i18n';
import { api, type SearchResult } from '../src/lib/api';
import { useAsyncAction } from '../src/hooks/useAsyncAction';
import { track } from '../src/services/analytics';
import { formatTimestamp } from '../src/services/notes';
import { useTheme } from '../src/theme/ThemeProvider';
import { space as spacing } from '../src/theme/tokens';

/**
 * Search across everything.
 *
 * It is semantic, not literal: "cell energy" finds ATP and mitochondria because
 * the query is embedded and compared against meaning, with lexical matching
 * blended in. Results resolve to the thing the student recognises — a page, a
 * moment in a lecture, a line in their notes — never an opaque chunk.
 */
export default function Search() {
  const router = useRouter();
  const theme = useTheme();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [semantic, setSemantic] = useState(true);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useAsyncAction(async (value: string) => {
    const response = await api.search({ query: value, limit: 30 });
    setResults(response.results);
    setSemantic(response.semantic);
    track('search_performed', { length: value.length, results: response.results.length });
  });

  // Debounced so a fast typist does not fire a request per keystroke.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setResults(null);
      return;
    }

    debounce.current = setTimeout(() => void search.run(trimmed), 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // `search.run` is stable via useCallback in the hook
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = useCallback(
    (result: SearchResult) => {
      if (!result.sourceId) return;
      if (result.kind === 'transcript') {
        router.push({
          pathname: '/source/[id]/transcript',
          params: { id: result.sourceId, at: result.startMs ?? 0 },
        });
      } else {
        router.push({ pathname: '/source/[id]', params: { id: result.sourceId } });
      }
    },
    [router],
  );

  const grouped = useMemo(() => results ?? [], [results]);

  return (
    <Screen>
      <View style={styles.header}>
        <Button
          label=""
          variant="ghost"
          size="sm"
          accessibilityLabel={t('common.back')}
          icon={<Icon name="arrow-left" size={20} color="textSecondary" />}
          onPress={() => router.back()}
          style={styles.back}
        />
        <Field
          value={query}
          onChangeText={setQuery}
          placeholder={t('library.searchPlaceholder')}
          icon="search"
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          containerStyle={styles.field}
          right={
            search.loading ? <ActivityIndicator size="small" color={theme.colors.textTertiary} /> : undefined
          }
        />
      </View>

      {search.error ? <Banner tone="danger" title={search.error.message} /> : null}

      {results === null ? (
        <View style={styles.hint}>
          <Icon name="search" size={22} color="textTertiary" />
          <Text variant="callout" color="textTertiary" align="center" style={styles.hintText}>
            {t('library.searchHint')}
          </Text>
        </View>
      ) : grouped.length === 0 && !search.loading ? (
        <EmptyState
          icon="search"
          title={t('library.noResults')}
          body={t('library.noResultsBody')}
        />
      ) : (
        <View style={styles.results}>
          {!semantic ? (
            <Banner
              tone="info"
              title="Matching on words only"
              message="Semantic search is briefly unavailable, so these are literal matches."
            />
          ) : null}

          {grouped.map((result) => (
            <Card key={result.id} onPress={() => open(result)} style={styles.result}>
              <View style={styles.resultHeader}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: result.spaceAccent ?? theme.colors.textTertiary },
                  ]}
                />
                <Text variant="micro" color="textTertiary" numberOfLines={1} style={styles.flex}>
                  {[result.spaceName, result.sourceTitle].filter(Boolean).join(' · ')}
                </Text>
                {result.startMs != null ? (
                  <Text variant="micro" color="accent">
                    {formatTimestamp(result.startMs)}
                  </Text>
                ) : (
                  <Text variant="micro" color="textTertiary">
                    {kindLabel(result.kind)}
                  </Text>
                )}
              </View>
              <Text variant="callout" numberOfLines={3}>
                {result.snippet}
              </Text>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'note': return t('note.studyGuide');
    case 'transcript': return t('note.transcript');
    case 'document': return t('space.material');
    case 'concept': return t('space.concepts');
    default: return '';
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.base,
  },
  back: { width: 40, paddingHorizontal: 0 },
  field: { flex: 1 },
  hint: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.giant },
  hintText: { maxWidth: 300 },
  results: { gap: spacing.sm },
  result: { gap: spacing.sm },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
