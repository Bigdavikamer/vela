import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Banner,
  Button,
  Field,
  Icon,
  ProgressBar,
  ScrollScreen,
  Sheet,
  Text,
  type IconName,
} from '../../src/components';
import { t } from '../../src/i18n';
import { useAsyncAction } from '../../src/hooks/useAsyncAction';
import { track } from '../../src/services/analytics';
import { useCreateSpace, useSpaces } from '../../src/services/spaces';
import { useUploadSource, type SourceKind } from '../../src/services/sources';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius, space as spacing } from '../../src/theme/tokens';

/**
 * The capture chooser.
 *
 * Every route in is one tap from here, and the destination space is chosen once
 * at the top rather than asked again per source. Recording is listed first
 * because it is the thing students do under time pressure, in a lecture hall.
 */
export default function Capture() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ spaceId?: string }>();

  const spaces = useSpaces();
  const createSpace = useCreateSpace();
  const upload = useUploadSource();

  const [spaceId, setSpaceId] = useState<string | undefined>(params.spaceId);
  const [spacePickerOpen, setSpacePickerOpen] = useState(false);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const selectedSpace = useMemo(
    () => (spaces.data ?? []).find((s) => s.id === spaceId) ?? spaces.data?.[0],
    [spaces.data, spaceId],
  );

  const effectiveSpaceId = spaceId ?? selectedSpace?.id;

  const pickDocument = useAsyncAction(async (kind: 'document' | 'media') => {
    const result = await DocumentPicker.getDocumentAsync({
      type:
        kind === 'document'
          ? ['application/pdf', 'text/plain', 'text/markdown', 'application/msword',
             'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
          : ['audio/*', 'video/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!effectiveSpaceId) return;

    track('capture_started', { kind });
    setUploadProgress(0);

    const sourceKind: SourceKind =
      kind === 'document'
        ? asset.mimeType?.includes('pdf')
          ? 'pdf'
          : 'document'
        : asset.mimeType?.startsWith('video')
          ? 'video'
          : 'audio';

    const source = await upload.mutateAsync({
      spaceId: effectiveSpaceId,
      uri: asset.uri,
      title: asset.name?.replace(/\.[^.]+$/, '') ?? 'Untitled',
      kind: sourceKind,
      mimeType: asset.mimeType ?? 'application/octet-stream',
      byteSize: asset.size,
      onProgress: setUploadProgress,
    });

    setUploadProgress(null);
    router.replace({ pathname: '/source/[id]', params: { id: source.id } });
  });

  const pickImage = useAsyncAction(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: false,
    });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!effectiveSpaceId) return;

    track('capture_started', { kind: 'image' });
    setUploadProgress(0);

    const source = await upload.mutateAsync({
      spaceId: effectiveSpaceId,
      uri: asset.uri,
      title: 'Photo',
      kind: 'image',
      mimeType: asset.mimeType ?? 'image/jpeg',
      byteSize: asset.fileSize,
      onProgress: setUploadProgress,
    });

    setUploadProgress(null);
    router.replace({ pathname: '/source/[id]', params: { id: source.id } });
  });

  const createSpaceAction = useAsyncAction(async () => {
    const created = await createSpace.mutateAsync({ name: newSpaceName });
    setSpaceId(created.id);
    setNewSpaceName('');
    setNewSpaceOpen(false);
    track('space_created', { during_onboarding: false });
  });

  const busy = pickDocument.loading || pickImage.loading || uploadProgress !== null;
  const error = pickDocument.error ?? pickImage.error ?? createSpaceAction.error;

  const options: {
    kind: string;
    icon: IconName;
    title: string;
    body: string;
    onPress: () => void;
  }[] = [
    {
      kind: 'recording',
      icon: 'mic',
      title: t('capture.record'),
      body: t('capture.recordBody'),
      onPress: () =>
        router.push({ pathname: '/capture/record', params: { spaceId: effectiveSpaceId } }),
    },
    {
      kind: 'audio',
      icon: 'headphones',
      title: t('capture.uploadAudio'),
      body: t('capture.uploadAudioBody'),
      onPress: () => void pickDocument.run('media'),
    },
    {
      kind: 'pdf',
      icon: 'file-text',
      title: t('capture.uploadPdf'),
      body: t('capture.uploadPdfBody'),
      onPress: () => void pickDocument.run('document'),
    },
    {
      kind: 'image',
      icon: 'image',
      title: t('capture.photo'),
      body: t('capture.photoBody'),
      onPress: () => void pickImage.run(),
    },
    {
      kind: 'text',
      icon: 'type',
      title: t('capture.pasteText'),
      body: t('capture.pasteTextBody'),
      onPress: () =>
        router.push({ pathname: '/capture/text', params: { spaceId: effectiveSpaceId } }),
    },
    {
      kind: 'url',
      icon: 'link',
      title: t('capture.link'),
      body: t('capture.linkBody'),
      onPress: () =>
        router.push({ pathname: '/capture/link', params: { spaceId: effectiveSpaceId } }),
    },
  ];

  return (
    <>
      <ScrollScreen>
        <View style={styles.header}>
          <View style={styles.headerBody}>
            <Text variant="title2">{t('capture.title')}</Text>
            <Text variant="caption" color="textSecondary">
              {t('capture.subtitle')}
            </Text>
          </View>
          <Button
            label=""
            variant="ghost"
            size="sm"
            accessibilityLabel={t('common.close')}
            icon={<Icon name="x" size={20} color="textSecondary" />}
            onPress={() => router.back()}
          />
        </View>

        {error ? <Banner tone="danger" title={error.message} style={styles.banner} /> : null}

        {/* Destination first, so no option below has to ask again. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('capture.chooseSpace')}: ${selectedSpace?.name ?? ''}`}
          onPress={() => setSpacePickerOpen(true)}
          style={({ pressed }) => [
            styles.spacePicker,
            { backgroundColor: theme.colors.fill, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text variant="caption" color="textTertiary">
            {t('capture.chooseSpace')}
          </Text>
          <View style={styles.spacePickerRow}>
            {selectedSpace ? (
              <View
                style={[
                  styles.dot,
                  { backgroundColor: theme.spaceAccent(selectedSpace.accent) },
                ]}
              />
            ) : null}
            <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
              {selectedSpace?.name ?? t('capture.newSpace')}
            </Text>
            <Icon name="chevron-down" size={18} color="textTertiary" />
          </View>
        </Pressable>

        {uploadProgress !== null ? (
          <View style={styles.uploading}>
            <Text variant="caption" color="textSecondary">
              {t('processing.queued')}
            </Text>
            <ProgressBar value={uploadProgress} label={t('processing.queued')} />
          </View>
        ) : null}

        <View style={[styles.options, { paddingBottom: insets.bottom + spacing.lg }]}>
          {options.map((option) => (
            <Pressable
              key={option.kind}
              accessibilityRole="button"
              accessibilityLabel={`${option.title}. ${option.body}`}
              disabled={busy || !effectiveSpaceId}
              onPress={option.onPress}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  opacity: busy || !effectiveSpaceId ? 0.5 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <View style={[styles.optionIcon, { backgroundColor: theme.colors.accentSurface }]}>
                <Icon name={option.icon} size={20} color="accent" />
              </View>
              <View style={styles.optionBody}>
                <Text variant="bodyStrong">{option.title}</Text>
                <Text variant="caption" color="textSecondary">
                  {option.body}
                </Text>
              </View>
              <Icon name="chevron-right" size={18} color="textTertiary" />
            </Pressable>
          ))}
        </View>
      </ScrollScreen>

      <Sheet
        visible={spacePickerOpen}
        onClose={() => setSpacePickerOpen(false)}
        title={t('capture.chooseSpace')}
      >
        <View style={styles.sheetList}>
          {(spaces.data ?? []).map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: item.id === effectiveSpaceId }}
              accessibilityLabel={item.name}
              onPress={() => {
                setSpaceId(item.id);
                setSpacePickerOpen(false);
              }}
              style={styles.sheetRow}
            >
              <View style={[styles.dot, { backgroundColor: theme.spaceAccent(item.accent) }]} />
              <Text variant="body" style={styles.flex} numberOfLines={1}>
                {item.name}
              </Text>
              {item.id === effectiveSpaceId ? <Icon name="check" size={18} color="accent" /> : null}
            </Pressable>
          ))}

          <Button
            label={t('capture.newSpace')}
            variant="secondary"
            icon={<Icon name="plus" size={16} color="text" />}
            onPress={() => {
              setSpacePickerOpen(false);
              setNewSpaceOpen(true);
            }}
            style={styles.sheetAction}
          />
        </View>
      </Sheet>

      <Sheet
        visible={newSpaceOpen}
        onClose={() => setNewSpaceOpen(false)}
        title={t('capture.newSpace')}
      >
        <View style={styles.sheetList}>
          <Field
            label={t('capture.spaceName')}
            value={newSpaceName}
            onChangeText={setNewSpaceName}
            placeholder={t('onboarding.studyingPlaceholder')}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => newSpaceName.trim() && void createSpaceAction.run()}
          />
          <Button
            label={t('common.save')}
            fullWidth
            disabled={!newSpaceName.trim()}
            loading={createSpaceAction.loading}
            onPress={() => void createSpaceAction.run()}
          />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.base,
    marginBottom: spacing.lg,
  },
  headerBody: { flex: 1, gap: 2 },
  banner: { marginBottom: spacing.base },

  spacePicker: {
    gap: spacing.xs,
    padding: spacing.base,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  spacePickerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },

  uploading: { gap: spacing.sm, marginBottom: spacing.base },

  options: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.base,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    minHeight: 72,
  },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionBody: { flex: 1, gap: 2 },

  sheetList: { gap: spacing.md, paddingBottom: spacing.base },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  sheetAction: { marginTop: spacing.sm },
});
