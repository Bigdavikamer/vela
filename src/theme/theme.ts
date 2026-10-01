import { palette, spaceAccents, type SpaceAccent } from './tokens';

/**
 * Semantic colour roles. Components reference these, never raw palette values,
 * so the two schemes stay in lockstep and a palette change is a one-file edit.
 */
export type ThemeColors = {
  /** app background */
  bg: string;
  /** cards, list rows */
  surface: string;
  /** surfaces that sit on top of a surface (sheets, popovers) */
  surfaceRaised: string;
  /** pressed / hovered fill */
  surfacePressed: string;
  /** subtle fill for chips, inputs, skeletons */
  fill: string;
  fillStrong: string;

  border: string;
  borderStrong: string;

  text: string;
  textSecondary: string;
  textTertiary: string;
  /** text drawn on top of `accent` */
  onAccent: string;

  accent: string;
  accentMuted: string;
  accentSurface: string;

  success: string;
  successSurface: string;
  warning: string;
  warningSurface: string;
  danger: string;
  dangerSurface: string;

  /** dimming layer behind modals */
  scrim: string;
  /** the warm glow used sparingly in focus mode and the capture screen */
  glow: string;
};

export type Theme = {
  scheme: 'light' | 'dark';
  colors: ThemeColors;
  /** Elevation is one soft shadow in light mode and a border in dark mode --
   *  dark surfaces do not read shadows, they read edges. */
  shadow: {
    card: object;
    sheet: object;
  };
  spaceAccent: (key: SpaceAccent) => string;
};

const darkColors: ThemeColors = {
  bg: palette.ink900,
  surface: palette.ink800,
  surfaceRaised: palette.ink750,
  surfacePressed: palette.ink700,
  fill: palette.ink750,
  fillStrong: palette.ink600,

  border: palette.ink700,
  borderStrong: palette.ink500,

  text: palette.warmWhite,
  textSecondary: palette.ink200,
  textTertiary: palette.ink300,
  onAccent: palette.ink900,

  accent: palette.candle400,
  accentMuted: palette.candle300,
  accentSurface: 'rgba(233,166,63,0.13)',

  success: palette.sage400,
  successSurface: 'rgba(127,190,156,0.14)',
  warning: palette.amber400,
  warningSurface: 'rgba(227,185,60,0.14)',
  danger: palette.rust400,
  dangerSurface: 'rgba(228,137,124,0.14)',

  scrim: 'rgba(6,7,9,0.66)',
  glow: 'rgba(233,166,63,0.20)',
};

const lightColors: ThemeColors = {
  bg: palette.parchment,
  surface: palette.white,
  surfaceRaised: palette.white,
  surfacePressed: palette.paper200,
  fill: palette.paper200,
  fillStrong: palette.paper300,

  border: palette.paper300,
  borderStrong: palette.paper400,

  text: palette.ink850,
  textSecondary: palette.ink500,
  textTertiary: palette.ink400,
  onAccent: palette.white,

  accent: palette.candle600,
  accentMuted: palette.candle500,
  accentSurface: 'rgba(156,92,8,0.09)',

  success: palette.sage600,
  successSurface: 'rgba(63,122,92,0.10)',
  warning: palette.amber600,
  warningSurface: 'rgba(138,94,0,0.10)',
  danger: palette.rust600,
  dangerSurface: 'rgba(168,64,47,0.09)',

  scrim: 'rgba(20,22,27,0.42)',
  glow: 'rgba(156,92,8,0.12)',
};

export const darkTheme: Theme = {
  scheme: 'dark',
  colors: darkColors,
  shadow: {
    // Dark surfaces read edges, not shadows.
    card: {},
    sheet: {
      shadowColor: '#000',
      shadowOpacity: 0.5,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: -6 },
      elevation: 16,
    },
  },
  spaceAccent: (key) => spaceAccents[key].dark,
};

export const lightTheme: Theme = {
  scheme: 'light',
  colors: lightColors,
  shadow: {
    card: {
      shadowColor: '#3B3226',
      shadowOpacity: 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    sheet: {
      shadowColor: '#3B3226',
      shadowOpacity: 0.16,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: -8 },
      elevation: 16,
    },
  },
  spaceAccent: (key) => spaceAccents[key].light,
};
