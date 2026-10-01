import React, { createContext, useContext, useMemo } from 'react';
import { AccessibilityInfo, Platform, useColorScheme } from 'react-native';

import { darkTheme, lightTheme, type Theme } from './theme';
import { type, type TypeToken } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

type ThemeContextValue = {
  theme: Theme;
  /** true when the user (or the OS) has asked for less animation */
  reduceMotion: boolean;
  /** user-controlled multiplier applied on top of OS dynamic type */
  fontScale: number;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export type ThemeProviderProps = {
  preference: ThemePreference;
  /** app-level preference; OR-ed with the OS setting, never overriding it */
  reduceMotionPreference?: boolean;
  fontScale?: number;
  children: React.ReactNode;
};

export function ThemeProvider({
  preference,
  reduceMotionPreference = false,
  fontScale = 1,
  children,
}: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const [osReduceMotion, setOsReduceMotion] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (active) setOsReduceMotion(v); })
      .catch(() => { /* older platforms simply report nothing */ });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOsReduceMotion);
    return () => { active = false; sub.remove(); };
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const scheme = preference === 'system' ? (systemScheme ?? 'dark') : preference;
    return {
      theme: scheme === 'light' ? lightTheme : darkTheme,
      reduceMotion: osReduceMotion || reduceMotionPreference,
      fontScale,
    };
  }, [preference, systemScheme, osReduceMotion, reduceMotionPreference, fontScale]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

export function useTheme(): Theme {
  return useThemeContext().theme;
}

/**
 * Reduced motion is respected everywhere by asking this hook rather than by
 * each component inventing its own rule.
 */
export function useReduceMotion(): boolean {
  return useThemeContext().reduceMotion;
}

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' });

/**
 * Resolves a type token into a React Native text style.
 *
 * Font sizes are multiplied by the user's Vela font-scale preference. We do NOT
 * disable `allowFontScaling`, so OS dynamic type still applies on top -- this
 * preference is an addition to accessibility settings, not a replacement.
 */
export function useTypeStyle(token: TypeToken, serifFamily?: string) {
  const { fontScale } = useThemeContext();
  return useMemo(() => {
    const t = type[token];
    return {
      fontSize: Math.round(t.size * fontScale),
      lineHeight: Math.round(t.line * fontScale),
      fontWeight: t.weight,
      letterSpacing: t.tracking,
      ...(t.serif ? { fontFamily: serifFamily ?? SERIF } : null),
    };
  }, [token, fontScale, serifFamily]);
}
