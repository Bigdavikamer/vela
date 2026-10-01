import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';

import { en } from './locales/en';
import { es } from './locales/es';
import { ptBR } from './locales/pt-BR';
import type { TranslationSchema } from './schema';

export type LocaleCode = 'en' | 'pt-BR' | 'es';

export const SUPPORTED_LOCALES: { code: LocaleCode; label: string; english: string }[] = [
  { code: 'en', label: 'English', english: 'English' },
  { code: 'pt-BR', label: 'Português (Brasil)', english: 'Portuguese (Brazil)' },
  { code: 'es', label: 'Español', english: 'Spanish' },
];

const i18n = new I18n({
  en,
  'pt-BR': ptBR,
  es,
});

i18n.enableFallback = true;
i18n.defaultLocale = 'en';

/**
 * Picks the closest supported locale for the device.
 * `pt-PT` and `pt-BR` both map to our Brazilian Portuguese rather than falling
 * all the way back to English.
 */
export function resolveDeviceLocale(): LocaleCode {
  const tags = getLocales().map((l) => l.languageTag);
  for (const tag of tags) {
    const exact = SUPPORTED_LOCALES.find((l) => l.code.toLowerCase() === tag.toLowerCase());
    if (exact) return exact.code;
    const base = tag.split('-')[0]?.toLowerCase();
    if (base === 'pt') return 'pt-BR';
    if (base === 'es') return 'es';
    if (base === 'en') return 'en';
  }
  return 'en';
}

export function setLocale(locale: LocaleCode) {
  i18n.locale = locale;
}

export function getLocale(): LocaleCode {
  return i18n.locale as LocaleCode;
}

/* -------------------------------------------------------------------------- */
/* Typed translate                                                            */
/* -------------------------------------------------------------------------- */

type Sections = TranslationSchema;
/** e.g. "home.reviewDue" -- every valid key, and nothing else. */
export type TKey = {
  [S in keyof Sections]: `${S & string}.${keyof Sections[S] & string}`;
}[keyof Sections];

/**
 * The app's only translation function.
 *
 * Keys are checked at compile time, so a renamed string cannot silently become
 * a missing label. Interpolation uses {{name}} placeholders.
 */
export function t(key: TKey, params?: Record<string, string | number>): string {
  return i18n.t(key, params ?? {});
}

/** Pluralisation-aware count helper for the handful of places that need it. */
export function tCount(key: TKey, count: number, params?: Record<string, string | number>): string {
  return i18n.t(key, { count, ...params });
}

export { i18n };
