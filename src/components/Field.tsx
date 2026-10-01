import React, { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { useTheme, useTypeStyle } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type FieldProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  /** shown under the field in a quiet tone */
  hint?: string;
  /** shown under the field in the danger tone; replaces `hint` */
  error?: string;
  icon?: IconName;
  right?: React.ReactNode;
  containerStyle?: ViewStyle;
  multilineMinHeight?: number;
};

export function Field({
  label,
  hint,
  error,
  icon,
  right,
  containerStyle,
  multiline,
  multilineMinHeight = 108,
  ...inputProps
}: FieldProps) {
  const theme = useTheme();
  const bodyStyle = useTypeStyle('body');
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.accent
      : theme.colors.border;

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text variant="captionStrong" color="textSecondary">
          {label}
        </Text>
      ) : null}

      <View
        style={[
          styles.inputWrap,
          {
            backgroundColor: theme.colors.surface,
            borderColor,
            // focus is signalled by a thicker rule as well as colour, so the
            // state is visible without relying on hue perception
            borderWidth: focused || error ? 2 : StyleSheet.hairlineWidth * 2,
            paddingVertical: focused || error ? space.md - 1 : space.md,
            alignItems: multiline ? 'flex-start' : 'center',
          },
        ]}
      >
        {icon ? (
          <View style={multiline ? styles.iconMultiline : undefined}>
            <Icon name={icon} size={18} color="textTertiary" />
          </View>
        ) : null}

        <TextInput
          {...inputProps}
          multiline={multiline}
          onFocus={(e) => { setFocused(true); inputProps.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); inputProps.onBlur?.(e); }}
          placeholderTextColor={theme.colors.textTertiary}
          accessibilityLabel={inputProps.accessibilityLabel ?? label}
          style={[
            bodyStyle,
            styles.input,
            { color: theme.colors.text },
            multiline ? { minHeight: multilineMinHeight, textAlignVertical: 'top' } : null,
          ]}
        />

        {right}
      </View>

      {error ? (
        <View style={styles.message}>
          <Icon name="alert-circle" size={13} color="danger" />
          <Text variant="caption" color="danger" style={styles.messageText}>
            {error}
          </Text>
        </View>
      ) : hint ? (
        <Text variant="caption" color="textTertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.sm },
  inputWrap: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.base,
    borderRadius: radius.md,
    minHeight: 52,
  },
  input: { flex: 1, padding: 0 },
  iconMultiline: { paddingTop: 3 },
  message: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  messageText: { flex: 1 },
});
