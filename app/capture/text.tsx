import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Banner, Button, Field, Icon, ScrollScreen, Text } from '../../src/components';
import { t } from '../../src/i18n';
import { useAsyncAction } from '../../src/hooks/useAsyncAction';
import { track } from '../../src/services/analytics';
import { useCreateTextSource } from '../../src/services/sources';
import { space as spacing } from '../../src/theme/tokens';

/** Pasting is the fastest way in: no permissions, no upload, no waiting. */
export default function CaptureText() {
  const router = useRouter();
  const params = useLocalSearchParams<{ spaceId?: string }>();
  const createText = useCreateTextSource();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const submit = useAsyncAction(async () => {
    if (!params.spaceId) throw new Error('No study space selected.');
    track('capture_started', { kind: 'text' });
    const source = await createText.mutateAsync({
      spaceId: params.spaceId,
      title: title.trim() || 'Pasted text',
      text: body,
    });
    router.replace({ pathname: '/source/[id]', params: { id: source.id } });
  });

  // Below this there is not enough to build a study guide from, and saying so
  // up front beats a failed job three minutes later.
  const tooShort = body.trim().length < 120;

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
        <Text variant="title2">{t('capture.pasteText')}</Text>
      </View>

      {submit.error ? <Banner tone="danger" title={submit.error.message} /> : null}

      <View style={styles.form}>
        <Field
          label={t('capture.titlePlaceholder')}
          value={title}
          onChangeText={setTitle}
          maxLength={120}
          returnKeyType="next"
        />

        <Field
          value={body}
          onChangeText={setBody}
          placeholder={t('capture.textPlaceholder')}
          multiline
          multilineMinHeight={260}
          autoFocus
          hint={tooShort && body.length > 0 ? 'A little more text will give a better study guide.' : undefined}
        />

        <Button
          label={t('common.continue')}
          size="lg"
          fullWidth
          loading={submit.loading}
          disabled={tooShort}
          onPress={() => void submit.run()}
        />
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md, marginTop: spacing.base, marginBottom: spacing.lg },
  back: { alignSelf: 'flex-start', paddingHorizontal: 0, width: 40 },
  form: { gap: spacing.lg },
});
