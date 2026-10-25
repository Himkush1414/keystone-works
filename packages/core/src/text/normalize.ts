import type { Skip } from '../model';
import { hinglishWord } from './hinglish';
import { lexicons, type Lexicon } from './lexicon';
import { cardinal, decimal, numberLang, ordinal, year, type NumberLang } from './numbers';
import type { Span } from './segment';

/**
 * A piece of the spoken text and the display range it came from. Pieces are contiguous and cover the
 * sentence; `replaced` pieces carry spoken words that differ from the display text (numbers, abbreviations,
 * skipped spans with empty speech), while identity pieces speak their display text as written.
 */
export interface Piece {
  start: number;
  end: number;
  spoken: string;
  replaced: boolean;
}

export interface Spoken {
  text: string;
  pieces: Piece[];
}

export interface DictionaryRule {
  match: string;
  sayAs: string;
  wholeWord: boolean;
  caseSensitive: boolean;
}

export interface NormalizeOptions {
  skips?: readonly Skip[];
  /** Pronunciation dictionary; the most specific scope first. Applied before every other rule. */
  dictionary?: readonly DictionaryRule[];
  /** Say "link" for URLs and e-mail addresses (true) or leave them out (false). */
  speakUrls?: boolean;
}

type Rule = { re: RegExp; fn: (m: RegExpMatchArray, ctx: RuleContext) => string | null };
interface RuleContext {
  text: string;
  /** Absolute offset of the match in the block text. */
  at: number;
  range: Span;
  /** Read links aloud as "link" (false: drop them). */
  speakUrls: boolean;
}

const L = '\\p{L}\\p{N}';
const before = `(?<![${L}])`;
const after = `(?![${L}])`;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function applyRule(text: string, pieces: Piece[], rule: Rule, range: Span, speakUrls: boolean): Piece[] {
  const out: Piece[] = [];
  for (const p of pieces) {
    if (p.replaced) {
      out.push(p);
      continue;
    }
    const slice = text.slice(p.start, p.end);
    let last = 0;
    for (const m of slice.matchAll(rule.re)) {
      const idx = m.index;
      if (idx < last || m[0].length === 0) continue;
      const spoken = rule.fn(m, { text, at: p.start + idx, range, speakUrls });
      if (spoken === null) continue;
      if (idx > last) out.push({ start: p.start + last, end: p.start + idx, spoken: '', replaced: false });
      out.push({ start: p.start + idx, end: p.start + idx + m[0].length, spoken, replaced: true });
      last = idx + m[0].length;
    }
    if (last < slice.length) out.push({ start: p.start + last, end: p.end, spoken: '', replaced: false });
  }
  return out;
}

/** Devanagari digits (२०२६) as ASCII digits. */
const toAsciiDigits = (s: string) => s.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x966));

/** Numbers as written in `lang`: thousands separator and decimal mark. */
function parseNumber(raw: string, lang: NumberLang): { int: string; frac: string } | null {
  const pointIsDot = lang === 'en' || lang === 'hi';
  const comma = pointIsDot ? ',' : '.';
  const dot = pointIsDot ? '.' : ',';
  const cleaned = toAsciiDigits(raw)
    .replace(/[\s\u00a0\u202f]/g, lang === 'fr' ? '' : ' ')
    .trim();
  if (/\s/.test(cleaned)) return null;
  const [intRaw = '', frac = ''] = cleaned.split(dot);
  const int = intRaw.split(comma).join('');
  if (!/^\d+$/.test(int) || (frac && !/^\d+$/.test(frac))) return null;
  return { int, frac };
}

function speakNumber(raw: string, lang: NumberLang): string | null {
  const n = parseNumber(raw, lang);
  if (!n) return null;
  if (n.int.length > 15 || (n.int.length > 1 && n.int.startsWith('0') && !n.frac)) {
    return [...n.int].map((d) => cardinal(Number(d), lang)).join(' ');
  }
  return n.frac ? decimal(n.int, n.frac, lang) : cardinal(Number(n.int), lang);
}

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
export function romanToInt(s: string): number | null {
  if (!/^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(s) || s === '') return null;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i] ?? ''] ?? 0;
    const next = ROMAN[s[i + 1] ?? ''] ?? 0;
    total += v < next ? -v : v;
  }
  return total;
}

/**
 * A clock time the way it's said in Hindi: 3:00 तीन बजे, 3:15 सवा तीन, 3:30 साढ़े तीन (1:30 डेढ़, 2:30 ढाई),
 * 3:45 पौने चार, other minutes तीन बजकर बीस मिनट. `bajeFollows`: the text already says बजे.
 */
function hindiTime(h: number, min: number, bajeFollows: boolean): string {
  const hour = (x: number) => cardinal(x % 12 === 0 ? 12 : x % 12, 'hi');
  const baje = bajeFollows ? '' : ' बजे';
  if (min === 0) return `${hour(h)}${baje}`;
  if (min === 15) return `सवा ${hour(h)}${baje}`;
  if (min === 30)
    return h % 12 === 1 ? `डेढ़${baje}` : h % 12 === 2 ? `ढाई${baje}` : `साढ़े ${hour(h)}${baje}`;
  if (min === 45) return `पौने ${hour(h + 1)}${baje}`;
  return bajeFollows ? `${hour(h)} ${cardinal(min, 'hi')}` : `${hour(h)} बजकर ${cardinal(min, 'hi')} मिनट`;
}

function feminine(word: string, lang: NumberLang): string {
  if (lang === 'es' || lang === 'pt' || lang === 'it') return word.replace(/o$/, 'a');
  return word;
}

/**
 * The rules for one language, compiled once: building them meant compiling ~30 Unicode regexes per sentence,
 * which on Hermes (the phone's JavaScript engine, no JIT) made opening a long book take minutes.
 */
const rulesCache = new Map<NumberLang, Rule[]>();
function rulesFor(lang: NumberLang): Rule[] {
  let rules = rulesCache.get(lang);
  if (!rules) rulesCache.set(lang, (rules = buildRules(lang, lexicons[lang])));
  return rules;
}

function buildRules(lang: NumberLang, lex: Lexicon): Rule[] {
  const rules: Rule[] = [];
  const unitKeys = Object.keys(lex.units)
    .sort((a, b) => b.length - a.length)
    .map(escapeRe);
  const unitRe = unitKeys.length ? `(?:[\\s\\u00a0]?(${unitKeys.join('|')})${after})?` : '()?';
  const num =
    lang === 'hi'
      ? // Indian grouping (1,00,000) and Devanagari digits.
        '[\\d०-९]{1,3}(?:,[\\d०-९]{2,3})+(?:\\.[\\d०-९]+)?|[\\d०-९]+(?:\\.[\\d०-९]+)?'
      : lang === 'en'
        ? '\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?'
        : lang === 'fr'
          ? '\\d{1,3}(?:[\\s\\u00a0\\u202f]\\d{3})+(?:,\\d+)?|\\d+(?:,\\d+)?'
          : '\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:,\\d+)?';
  const sayCount = (raw: string, one: string, many: string) => {
    const words = speakNumber(raw, lang);
    if (words === null) return null;
    const isOne = parseNumber(raw, lang)?.int === '1' && !parseNumber(raw, lang)?.frac;
    return `${words} ${isOne ? one : many}`;
  };

  // URLs and e-mail addresses.
  rules.push({
    re: /\b(?:https?:\/\/|www\.)[^\s<>"]+[^\s<>".,;:!?)\]]|\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/giu,
    fn: (_, ctx) => (ctx.speakUrls ? lex.link : ''),
  });

  // English street/saint and doctor/drive before the generic abbreviations.
  if (lang === 'en') {
    rules.push({ re: new RegExp(`${before}St\\.(?=\\s+\\p{Lu})`, 'gu'), fn: () => 'Saint' });
    rules.push({
      re: new RegExp(`(?<=\\p{Lu}\\p{Ll}+\\s)(St|Rd|Ave|Dr)\\.(?!\\s+\\p{Lu})`, 'gu'),
      fn: (m) => ({ St: 'Street', Rd: 'Road', Ave: 'Avenue', Dr: 'Drive' })[m[1] ?? ''] ?? null,
    });
  }

  // Abbreviations. Number-introducing ones expand only before a digit.
  const numericOnly = new Set([
    'p.',
    'pp.',
    'No.',
    'Nr.',
    'S.',
    'n.',
    'n°',
    'nº',
    'núm.',
    'pág.',
    'págs.',
    'pag.',
    'pagg.',
  ]);
  for (const [abbr, expansion] of Object.entries(lex.abbreviations).sort(
    (a, b) => b[0].length - a[0].length,
  )) {
    const tail = numericOnly.has(abbr) ? '(?=\\s?\\d)' : abbr.endsWith('.') ? '' : after;
    rules.push({
      re: new RegExp(`${before}${escapeRe(abbr)}${tail}`, 'gu'),
      fn: (m, ctx) =>
        ctx.at + m[0].length >= ctx.range.end && abbr.endsWith('.') ? `${expansion}.` : expansion,
    });
  }

  // Currency, prefix ($4.50, R$ 10) and suffix (4,50 €).
  const cur = Object.keys(lex.currency)
    .sort((a, b) => b.length - a.length)
    .map(escapeRe)
    .join('|');
  const sayMoney = (sym: string, raw: string) => {
    const names = lex.currency[sym];
    const n = parseNumber(raw, lang);
    if (!names || !n) return null;
    const [one, many, centOne, centMany] = names;
    const main = `${cardinal(Number(n.int), lang)} ${n.int === '1' ? one : many}`;
    const cents = n.frac ? Number(n.frac.padEnd(2, '0').slice(0, 2)) : 0;
    if (!cents || !centOne) return main;
    return `${main} ${lex.and} ${cardinal(cents, lang)} ${cents === 1 ? centOne : centMany}`;
  };
  rules.push({
    re: new RegExp(`(${cur})\\s?(${num})${after}`, 'gu'),
    fn: (m) => sayMoney(m[1] ?? '', m[2] ?? ''),
  });
  rules.push({
    re: new RegExp(`${before}(${num})\\s?(${cur})`, 'gu'),
    fn: (m) => sayMoney(m[2] ?? '', m[1] ?? ''),
  });

  // Percent.
  rules.push({
    re: new RegExp(`${before}(${num})\\s?%`, 'gu'),
    fn: (m) => {
      const w = speakNumber(m[1] ?? '', lang);
      return w === null ? null : `${w} ${lex.percent}`;
    },
  });

  // Times: 3:30, 3:30 pm, 15:00; French 15 h 30.
  rules.push({
    re: new RegExp(`${before}([01]?\\d|2[0-3]):([0-5]\\d)(?:\\s?([ap])\\.?m\\.?${after})?`, 'giu'),
    fn: (m, ctx) => {
      const h = Number(m[1]);
      const min = Number(m[2]);
      const mer = m[3]?.toLowerCase();
      if (lang === 'en') {
        const mins =
          min === 0
            ? mer
              ? ''
              : " o'clock"
            : ` ${min < 10 ? `oh ${cardinal(min, 'en')}` : cardinal(min, 'en')}`;
        const merWord = mer && lex.meridiem ? ` ${mer === 'a' ? lex.meridiem[0] : lex.meridiem[1]}` : '';
        const endsSentence = m[0].endsWith('.') && ctx.at + m[0].length >= ctx.range.end;
        return `${cardinal(h, 'en')}${mins}${merWord}${endsSentence ? '.' : ''}`;
      }
      if (lang === 'de')
        return `${cardinal(h, 'de').replace(/^eins$/, 'ein')} Uhr${min ? ` ${cardinal(min, 'de')}` : ''}`;
      if (lang === 'hi') return hindiTime(h, min, /^\s*बजे/.test(ctx.text.slice(ctx.at + m[0].length)));
      if (lang === 'fr')
        return `${cardinal(h, 'fr').replace(/^un$/, 'une')} heure${h > 1 ? 's' : ''}${min ? ` ${cardinal(min, 'fr')}` : ''}`;
      return `${cardinal(h, lang)}${min ? ` ${cardinal(min, lang)}` : ''}`;
    },
  });
  if (lang === 'fr') {
    rules.push({
      re: new RegExp(`${before}([01]?\\d|2[0-3])\\s?h\\s?([0-5]\\d)?${after}`, 'gu'),
      fn: (m) => {
        const h = Number(m[1]);
        return `${cardinal(h, 'fr').replace(/^un$/, 'une')} heure${h > 1 ? 's' : ''}${m[2] ? ` ${cardinal(Number(m[2]), 'fr')}` : ''}`;
      },
    });
  }

  // ISO dates 2026-10-20.
  rules.push({
    re: new RegExp(`${before}(1\\d{3}|20\\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])${after}`, 'gu'),
    fn: (m) => {
      const y = Number(m[1]);
      const mo = lex.months[Number(m[2]) - 1] ?? '';
      const d = Number(m[3]);
      if (lang === 'en') return `${mo} ${ordinal(d, 'en')}, ${year(y, 'en')}`;
      if (lang === 'de') return `${ordinal(d, 'de')} ${mo} ${year(y, 'de')}`;
      if (lang === 'fr') return `${d === 1 ? 'premier' : cardinal(d, 'fr')} ${mo} ${year(y, 'fr')}`;
      if (lang === 'es' || lang === 'pt') return `${cardinal(d, lang)} de ${mo} de ${year(y, lang)}`;
      if (lang === 'hi') return `${cardinal(d, 'hi')} ${mo} ${year(y, 'hi')}`;
      return `${d === 1 ? 'primo' : cardinal(d, 'it')} ${mo} ${year(y, 'it')}`;
    },
  });

  // English "October 20" → "October twentieth".
  if (lang === 'en') {
    rules.push({
      re: new RegExp(`(?<=(?:${lex.months.join('|')})\\s)([12]?\\d|3[01])(?:st|nd|rd|th)?${after}`, 'gu'),
      fn: (m) => ordinal(Number(m[1]), 'en'),
    });
  }
  // German "20. Oktober".
  if (lang === 'de') {
    rules.push({
      re: new RegExp(`${before}([12]?\\d|3[01])\\.(?=\\s(?:${lex.months.join('|')}))`, 'gu'),
      fn: (m, ctx) => {
        const prev = ctx.text.slice(Math.max(0, ctx.at - 8), ctx.at);
        return `${ordinal(Number(m[1]), 'de')}${/\b(am|vom|zum|bis zum)\s$/i.test(prev) ? 'n' : ''}`;
      },
    });
  }

  // Ordinal suffixes.
  const ordRe: Partial<Record<NumberLang, RegExp>> = {
    en: new RegExp(`${before}(\\d+)(st|nd|rd|th)${after}`, 'gu'),
    fr: new RegExp(`${before}(\\d+)(er|re|e|ème)${after}`, 'gu'),
    es: new RegExp(`${before}(\\d+)\\.?([ºª°])`, 'gu'),
    pt: new RegExp(`${before}(\\d+)\\.?([ºª°])`, 'gu'),
    it: new RegExp(`${before}(\\d+)\\.?([ºª°])`, 'gu'),
  };
  const oRe = ordRe[lang];
  if (oRe) {
    rules.push({
      re: oRe,
      fn: (m, ctx) => {
        const n = Number(m[1]);
        if (lang === 'fr') return n === 1 ? (m[2] === 're' ? 'première' : 'premier') : ordinal(n, 'fr');
        const w = ordinal(n, lang);
        if (m[2] === 'ª') return feminine(w, lang);
        // Spanish apocope before a noun: "el tercer piso", "el primer día".
        const beforeNoun = /^\s\p{Ll}/u.test(ctx.text.slice(ctx.at + m[0].length, ctx.at + m[0].length + 2));
        return lang === 'es' && beforeNoun ? w.replace(/^(prim|terc)ero$/, '$1er') : w;
      },
    });
  }

  // "#3" → "number three" (before plain numbers claim the digits).
  rules.push({
    re: /#(\d+)(?!\d)/gu,
    fn: (m) => `${lex.number} ${cardinal(Number(m[1]), lang)}`,
  });

  // Year ranges 1990–95, 1914-1918.
  rules.push({
    re: new RegExp(`${before}(1[0-9]{3}|20[0-9]{2})\\s?[–-]\\s?(\\d{2}|\\d{4})${after}`, 'gu'),
    fn: (m) => {
      const a = Number(m[1]);
      const bRaw = m[2] ?? '';
      const b = bRaw.length === 2 ? Math.floor(a / 100) * 100 + Number(bRaw) : Number(bRaw);
      if (b <= a) return null;
      return `${year(a, lang)} ${lex.to} ${year(b, lang)}`;
    },
  });

  // Numbers with an optional unit; four-digit numbers that look like years read as years.
  rules.push({
    re: new RegExp(`(?:(?<=^|\\s|\\()[-−])?${before}(${num})${unitRe}`, 'gu'),
    fn: (m) => {
      const raw = m[1] ?? '';
      const unit = m[2];
      const negative = m[0].startsWith('-') || m[0].startsWith('−');
      let words: string | null;
      if (unit) {
        const [one, many] = lex.units[unit] ?? ['', ''];
        words = sayCount(raw, one, many);
      } else if (
        /^\d{4}$/.test(toAsciiDigits(raw)) &&
        Number(toAsciiDigits(raw)) >= 1100 &&
        Number(toAsciiDigits(raw)) <= 2099
      ) {
        words = year(Number(toAsciiDigits(raw)), lang);
      } else {
        words = speakNumber(raw, lang);
      }
      if (words === null) return null;
      return negative ? `${lex.minus} ${words}` : words;
    },
  });

  // Roman numerals after cue words ("Chapter IV") and English regnal names ("Henry VIII" → "Henry the Eighth").
  rules.push({
    re: new RegExp(`(?<=(?:${lex.romanCardinalCues.map(escapeRe).join('|')})\\s)([IVXLCDM]+)${after}`, 'gu'),
    fn: (m) => {
      const n = romanToInt(m[1] ?? '');
      return n === null ? null : cardinal(n, lang);
    },
  });
  if (lang === 'en') {
    rules.push({
      re: new RegExp(
        `(?<=\\p{Lu}\\p{Ll}+\\s)(II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI)${after}`,
        'gu',
      ),
      fn: (m) => {
        const n = romanToInt(m[1] ?? '');
        if (n === null) return null;
        const o = ordinal(n, 'en');
        return `the ${o.charAt(0).toUpperCase()}${o.slice(1)}`;
      },
    });
  }

  // Symbols.
  rules.push({ re: /\s&\s/gu, fn: () => ` ${lex.and} ` });
  rules.push({ re: /(?<=[\d\s])\+(?=[\d\s])/gu, fn: () => ` ${lex.plus} ` });
  rules.push({ re: /(?<=[\d\s])=(?=[\d\s])/gu, fn: () => ` ${lex.equals} ` });
  rules.push({ re: /°(?![CF])/gu, fn: () => ` ${lex.degrees}` });

  // Hinglish: romanised Hindi words in Devanagari for the Hindi voice; English words stay as they are.
  if (lang === 'hi') {
    rules.push({
      re: new RegExp(`${before}\\p{Script=Latin}+${after}`, 'gu'),
      fn: (m) => hinglishWord(m[0]) ?? null,
    });
  }
  return rules;
}

const dictionaryCache = new WeakMap<readonly DictionaryRule[], Rule[]>();
function dictionaryRules(dictionary: readonly DictionaryRule[]): Rule[] {
  let rules = dictionaryCache.get(dictionary);
  if (!rules) dictionaryCache.set(dictionary, (rules = compileDictionary(dictionary)));
  return rules;
}

function compileDictionary(dictionary: readonly DictionaryRule[]): Rule[] {
  return [...dictionary]
    .filter((d) => d.match.trim() !== '')
    .sort((a, b) => b.match.length - a.match.length)
    .map((d) => ({
      re: new RegExp(
        d.wholeWord ? `${before}${escapeRe(d.match)}${after}` : escapeRe(d.match),
        d.caseSensitive ? 'gu' : 'giu',
      ),
      fn: () => d.sayAs,
    }));
}

/**
 * Builds the spoken form of `text[range]` for the voice: skipped spans removed, pronunciation dictionary
 * applied, and numbers, abbreviations and symbols expanded for `lang`.
 */
const NO_RULES: readonly DictionaryRule[] = [];

export function normalize(text: string, range: Span, lang: string, opts: NormalizeOptions = {}): Spoken {
  let pieces: Piece[] = [{ start: range.start, end: range.end, spoken: '', replaced: false }];

  const skips = (opts.skips ?? [])
    .filter((s) => s.end > range.start && s.start < range.end)
    .map((s) => ({ start: Math.max(s.start, range.start), end: Math.min(s.end, range.end) }))
    .sort((a, b) => a.start - b.start);
  if (skips.length) {
    const out: Piece[] = [];
    let cursor = range.start;
    for (const s of skips) {
      if (s.start < cursor) {
        if (s.end > cursor) {
          const prev = out[out.length - 1];
          if (prev) prev.end = s.end;
          cursor = s.end;
        }
        continue;
      }
      if (s.start > cursor) out.push({ start: cursor, end: s.start, spoken: '', replaced: false });
      out.push({ start: s.start, end: s.end, spoken: '', replaced: true });
      cursor = s.end;
    }
    if (cursor < range.end) out.push({ start: cursor, end: range.end, spoken: '', replaced: false });
    pieces = out;
  }

  const nl = numberLang(lang);
  const speakUrls = opts.speakUrls !== false;
  for (const rule of dictionaryRules(opts.dictionary ?? NO_RULES))
    pieces = applyRule(text, pieces, rule, range, speakUrls);
  if (nl) for (const rule of rulesFor(nl)) pieces = applyRule(text, pieces, rule, range, speakUrls);

  for (const p of pieces) if (!p.replaced) p.spoken = text.slice(p.start, p.end);
  const joined = pieces
    .map((p) => p.spoken)
    .join('')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return { text: joined, pieces };
}
