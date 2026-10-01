import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { NoteBlock } from '../services/notes';
import { useTheme, useTypeStyle } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';
import { Icon } from './Icon';
import { Text } from './Text';

/**
 * Renders one note block.
 *
 * Two ideas drive the design:
 *
 *  - Type carries the structure. A definition looks like a definition and a
 *    caution looks like a caution, so the page can be scanned rather than read
 *    end to end. No block type relies on colour alone.
 *  - Provenance is visible. A student can see at a glance whether a line came
 *    from their material, from Vela, or from their own editing — and tap
 *    through to the exact moment or page it came from.
 */
export function NoteBlockView({
  block,
  onPressSource,
  onLongPress,
  showOrigin = true,
}: {
  block: NoteBlock;
  onPressSource?: (block: NoteBlock) => void;
  onLongPress?: (block: NoteBlock) => void;
  showOrigin?: boolean;
}) {
  const theme = useTheme();
  const readingStyle = useTypeStyle('reading');
  const serifTitle = useTypeStyle('title2', 'Fraunces_600SemiBold');

  const hasSource =
    Boolean(onPressSource) &&
    ((block.source_ref.segment_ids?.length ?? 0) > 0 || block.source_ref.page != null);

  const content = (() => {
    switch (block.type) {
      case 'heading': {
        const level = block.level ?? 1;
        return (
          <Text
            style={[
              level === 1 ? serifTitle : undefined,
              level > 1 ? { fontSize: 18, lineHeight: 24, fontWeight: '600' } : undefined,
              styles.heading,
            ]}
            accessibilityRole="header"
          >
            {block.content}
          </Text>
        );
      }

      case 'definition':
        return (
          <View
            style={[
              styles.definition,
              { borderLeftColor: theme.colors.accent, backgroundColor: theme.colors.fill },
            ]}
          >
            <Text variant="bodyStrong">{block.term}</Text>
            <Text style={readingStyle} color="textSecondary">
              {block.content}
            </Text>
          </View>
        );

      case 'key_fact':
        return (
          <View style={[styles.callout, { backgroundColor: theme.colors.accentSurface }]}>
            <Icon name="star" size={15} color="accent" />
            <Text style={[readingStyle, styles.flex]}>{block.content}</Text>
          </View>
        );

      case 'callout':
        return (
          <View style={[styles.callout, { backgroundColor: theme.colors.warningSurface }]}>
            <Icon name="alert-triangle" size={15} color="warning" />
            <Text style={[readingStyle, styles.flex]}>{block.content}</Text>
          </View>
        );

      case 'example':
        return (
          <View style={[styles.example, { borderColor: theme.colors.border }]}>
            <Text variant="micro" color="textTertiary" uppercase>
              Example
            </Text>
            <Text style={readingStyle}>{block.content}</Text>
          </View>
        );

      case 'formula':
        return (
          <View style={[styles.formula, { backgroundColor: theme.colors.fill }]}>
            <Text style={styles.mono} selectable>
              {block.content}
            </Text>
          </View>
        );

      case 'quote':
        return (
          <View style={[styles.quote, { borderLeftColor: theme.colors.borderStrong }]}>
            <Text style={readingStyle} color="textSecondary">
              {block.content}
            </Text>
          </View>
        );

      case 'summary':
        return (
          <View style={[styles.summary, { borderColor: theme.colors.accent + '55' }]}>
            <Text variant="micro" color="accent" uppercase>
              Summary
            </Text>
            <Text style={readingStyle}>{block.content}</Text>
          </View>
        );

      case 'bullet':
        return (
          <View style={styles.bullet}>
            <View style={[styles.dot, { backgroundColor: theme.colors.textTertiary }]} />
            <Text style={[readingStyle, styles.flex]}>{block.content}</Text>
          </View>
        );

      case 'numbered':
        return (
          <View style={styles.bullet}>
            <Text variant="caption" color="textTertiary" style={styles.numberMarker}>
              •
            </Text>
            <Text style={[readingStyle, styles.flex]}>{block.content}</Text>
          </View>
        );

      default:
        return <Text style={readingStyle}>{block.content}</Text>;
    }
  })();

  return (
    <Pressable
      onLongPress={onLongPress ? () => onLongPress(block) : undefined}
      delayLongPress={350}
      accessibilityHint={onLongPress ? 'Long press to edit or rewrite' : undefined}
      style={styles.container}
    >
      {content}

      {(hasSource || (showOrigin && block.is_user_edited)) ? (
        <View style={styles.meta}>
          {block.is_user_edited ? (
            <View style={styles.originTag}>
              <Icon name="edit-2" size={11} color="textTertiary" />
              <Text variant="micro" color="textTertiary">
                Your edit
              </Text>
            </View>
          ) : null}

          {hasSource ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show where this came from"
              onPress={() => onPressSource?.(block)}
              style={styles.originTag}
              hitSlop={8}
            >
              <Icon name="corner-down-right" size={11} color="accent" />
              <Text variant="micro" color="accent">
                {block.source_ref.page != null
                  ? `Page ${block.source_ref.page}`
                  : 'In the recording'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { marginBottom: space.md },
  heading: { marginTop: space.lg, marginBottom: space.xs },

  definition: {
    gap: space.xs,
    padding: space.md,
    borderLeftWidth: 3,
    borderRadius: radius.sm,
  },
  callout: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.sm,
    alignItems: 'flex-start',
  },
  example: {
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  formula: { padding: space.md, borderRadius: radius.sm },
  mono: { fontFamily: 'monospace', fontSize: 15, lineHeight: 22 },
  quote: { paddingLeft: space.md, borderLeftWidth: 3 },
  summary: {
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  bullet: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 10 },
  numberMarker: { marginTop: 4 },

  meta: { flexDirection: 'row', gap: space.md, marginTop: space.xs },
  originTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
