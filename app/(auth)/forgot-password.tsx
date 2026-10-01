import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Banner, Button, Field, Icon, ScrollScreen, Text } from '../../src/components';
import { t } from '../../src/i18n';
import { useAsyncAction } from '../../src/hooks/useAsyncAction';
import { emailSchema, sendPasswordReset } from '../../src/services/auth';
import { space } from '../../src/theme/tokens';

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const emailValid = emailSchema.safeParse(email).success;

  const { run, loading, error } = useAsyncAction(async () => {
    await sendPasswordReset(email);
    setSent(true);
  });

  if (sent) {
    return (
      <ScrollScreen keyboardAware>
        <View style={styles.confirm}>
          <Icon name="mail" size={28} color="accent" />
          <Text variant="title2" align="center">
            {t('auth.resetSent')}
          </Text>
          {/* Deliberately does not confirm whether the account exists. */}
          <Text variant="callout" color="textSecondary" align="center">
            {t('auth.resetSentBody', { email: email.trim() })}
          </Text>
          <Button
            label={t('auth.signIn')}
            variant="secondary"
            onPress={() => router.replace('/(auth)/sign-in')}
            style={styles.confirmAction}
          />
        </View>
      </ScrollScreen>
    );
  }

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
        <Text variant="title1">{t('auth.forgotPassword')}</Text>
      </View>

      <View style={styles.form}>
        {error ? <Banner tone="danger" title={error.message} /> : null}

        <Field
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          placeholder={t('auth.emailPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="go"
          onSubmitEditing={() => emailValid && void run()}
        />

        <Button
          label={t('common.continue')}
          size="lg"
          fullWidth
          loading={loading}
          disabled={!emailValid}
          onPress={() => void run()}
        />
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.base, marginBottom: space.xl, marginTop: space.base },
  back: { alignSelf: 'flex-start', paddingHorizontal: 0, width: 40 },
  form: { gap: space.lg },
  confirm: { alignItems: 'center', gap: space.md, paddingTop: space.giant },
  confirmAction: { marginTop: space.base, minWidth: 200 },
});
