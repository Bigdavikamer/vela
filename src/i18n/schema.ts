import type { Translations } from './locales/en';

/**
 * English is declared `as const`, which makes every value a string *literal*
 * type. A translation obviously has different literals, so we widen them here:
 * the result still requires every key to be present, but accepts any string.
 *
 * The practical effect: forgetting to translate a key is a compile error, not a
 * blank label a Portuguese-speaking student discovers in production.
 */
export type TranslationSchema = {
  [K in keyof Translations]: {
    [J in keyof Translations[K]]: string;
  };
};

export type TranslationSection = keyof Translations;
