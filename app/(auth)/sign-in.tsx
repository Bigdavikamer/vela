import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Banner, Button, Field, Icon, ScrollScreen, Text } from '../../src/components';
import { t } from '../../src/i18n';
import { useAsyncAction } from '../../src/hooks/useAsyncAction';
import { emailSchema, sendMagicLink, signIn } from '../../src/services/auth';
import { space } from '../../src/theme/tokens';

export default function SignIn() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState(false);
  const [magicLinkSentTo, setMagicLinkSentTo] = useState<string | null>(null);

  const emailValid = emailSchema.safeParse(email).success;
  const emailError = touched && !emailValid ? t('auth.invalidEmail') : undefined;

  const signInAction = useAsyncAction(() => signIn({ email, password }));

  const magicLinkAction = useAsyncAction(async () => {
    await sendMagicLink(email);
    setMagicLinkSentTo(email.trim());
  });

  if (magicLinkSentTo) {
    return (
      <ScrollScreen keyboardAware>
        <View style={styles.confirm}>
          <Icon name="mail" size={28} color="accent" />
          <Text variant="title2" align="center">
            {t('auth.magicLinkSent')}
          </Text>
          <Text variant="callout" color="textSecondary" align="center">
            {t('auth.magicLinkSentBody', { email: magicLinkSentTo })}
          </Text>
          <Button
            label={t('common.back')}
            variant="secondary"
            onPress={() => setMagicLinkSentTo(null)}
            style={styles.confirmAction}
          />
        </View>
      </ScrollScreen>
    );
  }

  const error = signInAction.error ?? magicLinkAction.error;

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
        <Text variant="title1">{t('auth.signIn')}</Text>
      </View>

      <View style={styles.form}>
        {error ? <Banner tone="danger" title={error.message} /> : null}

        <Field
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          onBlur={() => setTouched(true)}
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
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void signInAction.run()}
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
          label={t('auth.signIn')}
          size="lg"
          fullWidth
          loading={signInAction.loading}
          disabled={!emailValid || password.length === 0}
          onPress={() => void signInAction.run()}
        />

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text variant="caption" color="textTertiary">
            {t('auth.or')}
          </Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Passwordless is offered on equal footing: it is also the recovery
            path, so a forgotten password never becomes a dead end. */}
        <Button
          label={t('auth.magicLink')}
          variant="secondary"
          fullWidth
          loading={magicLinkAction.loading}
          disabled={!emailValid}
          icon={<Icon name="mail" size={16} color="text" />}
          onPress={() => void magicLinkAction.run()}
        />

        <View style={styles.footer}>
          <Button
            label={t('auth.forgotPassword')}
            variant="ghost"
            size="sm"
            onPress={() => router.push('/(auth)/forgot-password')}
          />
        </View>

        <View style={styles.footer}>
          <Text variant="caption" color="textSecondary">
            {t('auth.noAccount')}
          </Text>
          <Button
            label={t('auth.signUp')}
            variant="ghost"
            size="sm"
            onPress={() => router.replace('/(auth)/sign-up')}
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
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#8884' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs },
  confirm: { alignItems: 'center', gap: space.md, paddingTop: space.giant },
  confirmAction: { marginTop: space.base, minWidth: 200 },
});
