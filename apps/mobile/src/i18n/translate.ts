import { de } from './catalogs/de';
import { en, type Catalog } from './catalogs/en';
import { es } from './catalogs/es';
import { fr } from './catalogs/fr';
import { pt } from './catalogs/pt';

export type Locale = 'en' | 'es' | 'de' | 'fr' | 'pt';

export const LOCALES: readonly Locale[] = ['en', 'es', 'de', 'fr', 'pt'];

export const catalogs: Record<Locale, Catalog> = { en, es, de, fr, pt };

/** Native names for the language picker. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
  pt: 'Português (Brasil)',
};

type Plural = { one: string; other: string };

/** Dotted paths to every leaf (strings and plural objects) of the catalog. */
type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends Plural
      ? `${P}${K}`
      : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TKey = Paths<Catalog>;
export type Params = Record<string, string | number>;

/** First supported locale among the device's preferred languages (BCP 47 tags), else English. */
export function resolveLocale(tags: readonly string[]): Locale {
  for (const tag of tags) {
    const base = tag.toLowerCase().split(/[-_]/)[0] as Locale;
    if (LOCALES.includes(base)) return base;
  }
  return 'en';
}

/** CLDR plural category for our languages: French and Brazilian Portuguese treat 0 as singular. */
export function pluralCategory(locale: Locale, n: number): 'one' | 'other' {
  const i = Math.floor(Math.abs(n));
  if (locale === 'fr' || locale === 'pt') return i === 0 || i === 1 ? 'one' : 'other';
  return n === 1 ? 'one' : 'other';
}

export function formatNumber(locale: Locale, n: number, maxFractionDigits = 2): string {
  try {
    return new Intl.NumberFormat(locale === 'pt' ? 'pt-BR' : locale, {
      maximumFractionDigits: maxFractionDigits,
    }).format(n);
  } catch {
    return String(Math.round(n * 10 ** maxFractionDigits) / 10 ** maxFractionDigits);
  }
}

function lookup(catalog: Catalog, key: string): string | Plural | undefined {
  let node: unknown = catalog;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node === 'string') return node;
  if (node && typeof node === 'object' && 'one' in node && 'other' in node) return node as Plural;
  return undefined;
}

/**
 * Translates `key` with `{param}` interpolation. Plural entries choose by `params.n`. Missing keys fall back
 * to English, then to the key itself (never crash the UI over a string).
 */
export function translate(locale: Locale, key: TKey, params: Params = {}): string {
  const entry = lookup(catalogs[locale], key) ?? lookup(en, key);
  if (entry === undefined) return key;
  const template = typeof entry === 'string' ? entry : entry[pluralCategory(locale, Number(params.n ?? 0))];
  return template.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = params[name];
    if (v === undefined) return m;
    return typeof v === 'number' ? formatNumber(locale, v) : v;
  });
}

/** "2 h 14 min", "45 min", "Less than a minute". */
export function formatDuration(locale: Locale, ms: number): string {
  const totalMinutes = Math.round(Math.max(0, ms) / 60_000);
  if (totalMinutes < 1) return translate(locale, 'time.lessThanMinute');
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? translate(locale, 'time.hoursMinutes', { h, m }) : translate(locale, 'time.minutes', { m });
}
