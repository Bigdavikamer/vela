import React from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme, useTypeStyle } from '../theme/ThemeProvider';
import type { ThemeColors } from '../theme/theme';
import type { TypeToken } from '../theme/tokens';

export type TextProps = RNTextProps & {
  variant?: TypeToken;
  /** semantic colour role; defaults to primary text */
  color?: keyof ThemeColors;
  align?: TextStyle['textAlign'];
  /** override for one-off cases such as a space's accent colour */
  tint?: string;
  uppercase?: boolean;
};

/**
 * The only text primitive in the app.
 *
 * `allowFontScaling` is deliberately left at its default (true) so OS dynamic
 * type always works; our own font-scale preference multiplies on top of it.
 */
export const Text = React.memo(function Text({
  variant = 'body',
  color = 'text',
  align,
  tint,
  uppercase,
  style,
  children,
  ...rest
}: TextProps) {
  const theme = useTheme();
  const typeStyle = useTypeStyle(variant);

  return (
    <RNText
      {...rest}
      style={[
        typeStyle,
        { color: tint ?? theme.colors[color] },
        align ? { textAlign: align } : null,
        uppercase ? { textTransform: 'uppercase' } : null,
        style,
      ]}
    >
      {children}
    </RNText>
  );
});
