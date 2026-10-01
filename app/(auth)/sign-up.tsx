import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Banner, Button, Field, Icon, ScrollScreen, Text } from '../../src/components';
import { t } from '../../src/i18n';
import { useAsyncAction } from '../../src/hooks/useAsyncAction';
import { emailSchema, passwordSchema, signUp } from '../../src/services/auth';
import { usePreferences } from '../../src/stores/preferences';
import { space } from '../../src/theme/tokens';

export default function SignUp() {
  const router = useRouter();
  const uiLocale = usePreferences((s) => s.uiLocale);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // Validation shows only after a field has been touched, so the form does not
  // scold someone who has not finished typing.
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const nameError = touched.name && !name.trim() ? t('auth.nameRequired') : undefined;
  const emailError =
    touched.email && !emailSchema.safeParse(email).success ? t('auth.invalidEmail') : undefined;
  const passwordError =
    touched.password && !passwordSchema.safeParse(password).success
      ? t('auth.passwordTooShort')
      : undefined;

  const canSubmit =
    name.trim().length > 0 &&
    emailSchema.safeParse(email).success &&
    passwordSchema.safeParse(password).success;

  const { run, loading, error } = useAsyncAction(async () => {
    const result = await signUp({ email, password, displayName: name, uiLocale });
    if (result.needsConfirmation) {
      setSentTo(email.trim());
    }
    // With confirmation off, the auth listener picks up the session and the
    // route guard moves us into onboarding — nothing to do here.
    return result;
  });

  if (sentTo) {
    return (
      <ScrollScreen keyboardAware>
        <View style={styles.confirm}>
          <Icon name="mail" size={28} color="accent" />
          <Text variant="title2" align="center">
            {t('auth.checkInbox')}
          </Text>
          <Text variant="callout" color="textSecondary" align="center">
            {t('auth.checkInboxBody', { email: sentTo })}
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
        <Text variant="title1">{t('auth.signUp')}</Text>
      </View>

      <View style={styles.form}>
        {error ? <Banner tone="danger" title={error.message} /> : null}

        <Field
          label={t('auth.displayName')}
          value={name}
          onChangeText={setName}
          onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
          error={nameError}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
        />

        <Field
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
          error={emailError}
          placeholder={t('auth.emailPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
        />

        <Field
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
          error={passwordError}
          hint={t('auth.passwordHint')}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={() => canSubmit && void run()}
          right={
            <Button
              label=""
              variant="ghost"
              size="sm"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              icon={<Icon name={showPassword ? 'eye-off' : 'eye'} size={18} color="textTertiary" />}
              onPress={() => setShowPassword((v) => !v)}
              haptic={false}
              style={styles.reveal}
            />
          }
        />

        <Button
          label={t('auth.signUp')}
          size="lg"
          fullWidth
          loading={loading}
          disabled={!canSubmit}
          onPress={() => void run()}
          style={styles.submit}
        />

        <View style={styles.footer}>
          <Text variant="caption" color="textSecondary">
            {t('auth.hasAccount')}
          </Text>
          <Button
            label={t('auth.signIn')}
            variant="ghost"
            size="sm"
            onPress={() => router.replace('/(auth)/sign-in')}
          />
        </View>
      </View>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.base, marginBottom: space.xl, marginTop: space.base },
  back: { alignSelf: 'flex-start', paddingHorizontal: 0, width: 40 },
  form: { gap: space.lg },
  reveal: { paddingHorizontal: space.xs, height: 32 },
  submit: { marginTop: space.sm },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  confirm: { alignItems: 'center', gap: space.md, paddingTop: space.giant },
  confirmAction: { marginTop: space.base, minWidth: 200 },
});
