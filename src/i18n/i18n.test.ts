import { en } from './locales/en';
import { es } from './locales/es';
import { ptBR } from './locales/pt-BR';

/**
 * The whole point of the typed i18n layer is that a missing translation is a
 * compile error. These tests cover what types cannot: that no translation was
 * left as the English string, and that interpolation placeholders survived
 * translation — a dropped {{count}} produces a visibly broken sentence at
 * runtime and TypeScript would never notice.
 */

type Section = Record<string, string>;
const LOCALES: [string, Record<string, Section>][] = [
  ['pt-BR', ptBR as unknown as Record<string, Section>],
  ['es', es as unknown as Record<string, Section>],
];

const english = en as unknown as Record<string, Section>;

/** Keys that legitimately read the same in every language. */
const SHARED_BY_DESIGN = new Set([
  'common.minutes',
  'settings.version',
  'billing.perMonth',
  'billing.perYear',
  'billing.plus',
  'billing.title',
  'tutor.title',
  'quiz.questionOf',
]);

describe.each(LOCALES)('%s', (name, locale) => {
  it('has every section English has', () => {
    expect(Object.keys(locale).sort()).toEqual(Object.keys(english).sort());
  });

  it('has every key English has, with no empty values', () => {
    for (const [section, entries] of Object.entries(english)) {
      for (const key of Object.keys(entries)) {
        const value = locale[section]?.[key];
        expect(typeof value).toBe('string');
        expect((value ?? '').trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('preserves every {{placeholder}} from the English source', () => {
    const problems: string[] = [];

    for (const [section, entries] of Object.entries(english)) {
      for (const [key, source] of Object.entries(entries)) {
        const expected = placeholders(source);
        const actual = placeholders(locale[section]?.[key] ?? '');
        if (expected.join(',') !== actual.join(',')) {
          problems.push(`${section}.${key}: expected [${expected}] got [${actual}]`);
        }
      }
    }

    expect(problems).toEqual([]);
  });

  it('does not leave substantial strings untranslated', () => {
    const untranslated: string[] = [];

    for (const [section, entries] of Object.entries(english)) {
      for (const [key, source] of Object.entries(entries)) {
        const path = `${section}.${key}`;
        if (SHARED_BY_DESIGN.has(path)) continue;
        // Short words and proper nouns can coincide; long sentences cannot.
        if (source.length < 25) continue;
        if (locale[section]?.[key] === source) untranslated.push(path);
      }
    }

    expect(untranslated).toEqual([]);
  });
});

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
}
