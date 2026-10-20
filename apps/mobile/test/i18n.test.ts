import { describe, expect, it } from 'vitest';
import {
  catalogs,
  formatDuration,
  LOCALES,
  pluralCategory,
  resolveLocale,
  translate,
  type Locale,
} from '../src/i18n/translate';

type Tree = { [k: string]: string | Tree };

function leaves(node: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(path, v);
    else for (const [p, s] of leaves(v, path)) out.set(p, s);
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('catalogs', () => {
  const english = leaves(catalogs.en as unknown as Tree);

  it.each(LOCALES.filter((l) => l !== 'en'))('%s has every English key and no extras', (locale) => {
    const other = leaves(catalogs[locale] as unknown as Tree);
    expect([...other.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it.each(LOCALES)('%s keeps the same placeholders as English', (locale) => {
    const other = leaves(catalogs[locale] as unknown as Tree);
    for (const [key, text] of english)
      expect(placeholders(other.get(key) ?? ''), `${locale}:${key}`).toEqual(placeholders(text));
  });

  it.each(LOCALES)('%s has no empty strings or leftover English in sentences', (locale) => {
    for (const [key, text] of leaves(catalogs[locale] as unknown as Tree)) {
      expect(text.trim(), `${locale}:${key}`).not.toBe('');
      expect(text, `${locale}:${key}`).not.toMatch(/\s$|^\s/);
    }
  });

  it('uses French typographic spacing', () => {
    for (const [key, text] of leaves(catalogs.fr as unknown as Tree)) {
      expect(text, key).not.toMatch(/ [;!?»]|« | :(?!\/)/);
      expect(text, key).not.toMatch(/\S[;!?]/);
    }
  });

  it('contains no invisible characters other than the French no-break spaces', () => {
    for (const locale of LOCALES) {
      for (const [key, text] of leaves(catalogs[locale] as unknown as Tree)) {
        expect(text, `${locale}:${key}`).not.toMatch(/[\u200b\u00ad\ufeff]/);
        if (locale !== 'fr') expect(text, `${locale}:${key}`).not.toMatch(/[\u202f]/);
      }
    }
  });
});

describe('translate', () => {
  it('interpolates parameters and formats numbers for the locale', () => {
    expect(translate('en', 'library.timeLeft', { time: '2 h' })).toBe('2 h left');
    expect(translate('de', 'intro.page', { page: 1, total: 3 })).toBe('Seite 1 von 3');
    expect(translate('de', 'a11y.speedValue', { speed: 1.25 })).toBe('1,25-faches Tempo');
  });

  it('chooses plural forms by language', () => {
    expect(translate('en', 'cast.lines', { n: 1 })).toBe('1 line');
    expect(translate('en', 'cast.lines', { n: 0 })).toBe('0 lines');
    expect(translate('fr', 'cast.lines', { n: 0 })).toBe('0 réplique');
    expect(translate('pt', 'cast.lines', { n: 2 })).toBe('2 falas');
    expect(pluralCategory('de' as Locale, 1)).toBe('one');
    expect(pluralCategory('fr', 1.5)).toBe('one');
  });

  it('leaves unknown placeholders visible and falls back on missing keys', () => {
    expect(translate('en', 'library.timeLeft')).toBe('{time} left');
    expect(translate('en', 'nope.missing' as never)).toBe('nope.missing');
  });
});

describe('locales and durations', () => {
  it('resolves the first supported device language', () => {
    expect(resolveLocale(['ja-JP', 'pt-BR', 'en-US'])).toBe('pt');
    expect(resolveLocale(['de_AT'])).toBe('de');
    expect(resolveLocale(['zh-Hans'])).toBe('en');
    expect(resolveLocale([])).toBe('en');
  });

  it('formats listening durations', () => {
    expect(formatDuration('en', 20_000)).toBe('Less than a minute');
    expect(formatDuration('en', 45 * 60_000)).toBe('45 min');
    expect(formatDuration('en', 134 * 60_000)).toBe('2 h 14 min');
    expect(formatDuration('de', 134 * 60_000)).toBe('2 Std. 14 Min.');
  });
});
