import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';

export type ScreenProps = {
  children: React.ReactNode;
  /** apply horizontal gutters (default true) */
  padded?: boolean;
  /** respect the top safe area (default true; false when a header handles it) */
  edgeTop?: boolean;
  edgeBottom?: boolean;
  style?: StyleProp<ViewStyle>;
  backgroundColor?: string;
};

export function Screen({
  children,
  padded = true,
  edgeTop = true,
  edgeBottom = false,
  style,
  backgroundColor,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.flex,
        { backgroundColor: backgroundColor ?? theme.colors.bg },
        padded ? styles.padded : null,
        edgeTop ? { paddingTop: insets.top } : null,
        edgeBottom ? { paddingBottom: insets.bottom } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export type ScrollScreenProps = ScreenProps &
  Pick<ScrollViewProps, 'refreshControl' | 'onScroll' | 'scrollEventThrottle' | 'stickyHeaderIndices'> & {
    /** extra bottom padding so content clears the tab bar / floating actions */
    bottomInset?: number;
    keyboardAware?: boolean;
    contentStyle?: StyleProp<ViewStyle>;
  };

export function ScrollScreen({
  children,
  padded = true,
  edgeTop = true,
  bottomInset = space.xxxl,
  keyboardAware = false,
  style,
  contentStyle,
  backgroundColor,
  ...scrollProps
}: ScrollScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const scroller = (
    <ScrollView
      {...scrollProps}
      style={[styles.flex, { backgroundColor: backgroundColor ?? theme.colors.bg }, style]}
      contentContainerStyle={[
        padded ? styles.padded : null,
        { paddingTop: edgeTop ? insets.top : 0, paddingBottom: insets.bottom + bottomInset },
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );

  if (!keyboardAware) return scroller;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {scroller}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  padded: { paddingHorizontal: space.lg },
});
