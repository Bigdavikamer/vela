import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Banner, Button, Field, Icon, ScrollScreen, Text } from '../../src/components';
import { t } from '../../src/i18n';
import { useAsyncAction } from '../../src/hooks/useAsyncAction';
import { track } from '../../src/services/analytics';
import { useCreateUrlSource } from '../../src/services/sources';
import { space as spacing } from '../../src/theme/tokens';

export default function CaptureLink() {
  const router = useRouter();
  const params = useLocalSearchParams<{ spaceId?: string }>();
  const createUrl = useCreateUrlSource();

  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');

  const valid = /^https?:\/\/\S+\.\S+/i.test(url.trim());
  const isYoutube = /(?:youtube\.com|youtu\.be)/i.test(url.trim());

  const submit = useAsyncAction(async () => {
    if (!params.spaceId) throw new Error('No study space selected.');
    track('capture_started', { kind: 'url' });
    const source = await createUrl.mutateAsync({
      spaceId: params.spaceId,
      title: title.trim() || undefined,
      url: url.trim(),
    });
    router.replace({ pathname: '/source/[id]', params: { id: source.id } });
  });

  return (
    <ScrollScreen keyboardAware>
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
        <Text variant="title2">{t('capture.link')}</Text>
      </View>

      {submit.error ? <Banner tone="danger" title={submit.error.message} /> : null}

      {isYoutube ? (
        <Banner
          tone="info"
          title="Video links need captions"
          message="Vela reads the page text. If the video has no transcript or captions available, download the audio and upload it instead."
          style={styles.banner}
        />
      ) : null}

      <View style={styles.form}>
        <Field
          value={url}
          onChangeText={setUrl}
          placeholder={t('capture.urlPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          autoFocus
          returnKeyType="next"
        />

        <Field
          label={t('capture.titlePlaceholder')}
          value={title}
          onChangeText={setTitle}
          maxLength={120}
          returnKeyType="go"
          onSubmitEditing={() => valid && void submit.run()}
        />

        <Button
          label={t('common.continue')}
          size="lg"
          fullWidth
          loading={submit.loading}
          disabled={!valid}
          onPress={() => void submit.run()}
        />
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md, marginTop: spacing.base, marginBottom: spacing.lg },
  back: { alignSelf: 'flex-start', paddingHorizontal: 0, width: 40 },
  banner: { marginBottom: spacing.base },
  form: { gap: spacing.lg },
});
