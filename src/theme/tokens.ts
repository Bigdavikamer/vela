/**
 * Vela design tokens.
 *
 * The brand is candlelight: a warm point of focus in a dark, quiet room. That
 * gives us a dark-first palette with warm off-white text (paper, not screen)
 * and a single amber accent. Light mode is parchment rather than pure white.
 *
 * Rules this file enforces by construction:
 *  - One accent. Colour is never the only carrier of meaning.
 *  - Depth comes from borders and a single soft shadow, not stacked glass.
 *  - Every semantic role exists in both schemes, so no component ever needs an
 *    `isDark ? ... : ...` branch.
 */

export const palette = {
  // Neutrals -- cool in the shadows, warm in the highlights
  ink900: '#0A0B0E',
  ink850: '#0E1014',
  ink800: '#14161B',
  ink750: '#1A1D23',
  ink700: '#21242B',
  ink600: '#2A2E37',
  ink500: '#3A3F4A',
  ink400: '#565C68',
  ink300: '#767D8A',
  ink200: '#9BA2AE',
  ink100: '#C3C8D1',

  white: '#FFFFFF',
  paper100: '#FDFCFA',
  parchment: '#FAF7F1',
  paper200: '#F3EFE7',
  paper300: '#E8E2D6',
  paper400: '#D9D2C4',

  warmWhite: '#F4F1EA',

  // Candle -- the one accent
  candle600: '#9C5C08',
  candle500: '#C17D16',
  candle400: '#E9A63F',
  candle300: '#F2C476',
  candle200: '#F7DFB2',

  // Status
  sage600: '#3F7A5C',
  sage500: '#5E9E7C',
  sage400: '#7FBE9C',

  amber600: '#8A5E00',
  amber500: '#C99400',
  amber400: '#E3B93C',

  rust600: '#A8402F',
  rust500: '#D2685A',
  rust400: '#E4897C',

  tide600: '#2C6E8F',
  tide500: '#4A90AE',
} as const;

/**
 * Per-space accent hues. Chosen to differ in BOTH hue and lightness so they
 * stay distinguishable in greyscale and to colour-blind users -- a space is
 * always also labelled by name, never by colour alone.
 */
export const spaceAccents = {
  candle: { light: '#9C5C08', dark: '#E9A63F' },
  ember:  { light: '#A8442F', dark: '#E2856F' },
  sage:   { light: '#3F7A5C', dark: '#7FBE9C' },
  tide:   { light: '#2C6E8F', dark: '#6BB6D6' },
  plum:   { light: '#63457F', dark: '#B292D9' },
  slate:  { light: '#48546A', dark: '#95A3B8' },
  clay:   { light: '#96455C', dark: '#DB8FA4' },
  moss:   { light: '#47632C', dark: '#9CC46B' },
} as const;

export type SpaceAccent = keyof typeof spaceAccents;
export const spaceAccentKeys = Object.keys(spaceAccents) as SpaceAccent[];

/** 4pt base scale, named by intent so layouts read as prose. */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 56,
  giant: 72,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
  pill: 999,
} as const;

/**
 * Type scale. `serif: true` selects the brand serif (Fraunces) for display
 * moments; everything else uses the platform UI font, which is what makes an
 * app feel native rather than skinned.
 */
export const type = {
  display:       { size: 34, line: 40, weight: '600' as const, serif: true,  tracking: -0.6 },
  title1:        { size: 27, line: 33, weight: '600' as const, serif: true,  tracking: -0.4 },
  title2:        { size: 21, line: 27, weight: '600' as const, serif: false, tracking: -0.3 },
  title3:        { size: 17, line: 23, weight: '600' as const, serif: false, tracking: -0.2 },
  body:          { size: 16, line: 24, weight: '400' as const, serif: false, tracking: 0 },
  bodyStrong:    { size: 16, line: 24, weight: '600' as const, serif: false, tracking: 0 },
  /** long-form reading (notes, transcripts) gets extra leading */
  reading:       { size: 16, line: 27, weight: '400' as const, serif: false, tracking: 0 },
  callout:       { size: 15, line: 21, weight: '400' as const, serif: false, tracking: 0 },
  caption:       { size: 13, line: 18, weight: '400' as const, serif: false, tracking: 0 },
  captionStrong: { size: 13, line: 18, weight: '600' as const, serif: false, tracking: 0 },
  micro:         { size: 11, line: 14, weight: '600' as const, serif: false, tracking: 0.6 },
} as const;

export type TypeToken = keyof typeof type;

/**
 * Motion. Durations are short on purpose -- an interface that makes you wait in
 * order to feel premium is not premium.
 */
export const motion = {
  duration: {
    instant: 90,
    fast: 150,
    base: 220,
    slow: 320,
    /** Only for one-off celebratory moments, never for navigation. */
    deliberate: 520,
  },
  spring: {
    /** Default for anything the finger drives. */
    responsive: { damping: 22, stiffness: 260, mass: 0.9 },
    /** Sheets and large surfaces. */
    settle: { damping: 26, stiffness: 180, mass: 1 },
    /** Small delightful pops -- card flips, check marks. */
    pop: { damping: 14, stiffness: 320, mass: 0.7 },
  },
} as const;

export const zIndex = {
  base: 0,
  raised: 10,
  header: 20,
  sheet: 40,
  toast: 60,
} as const;
