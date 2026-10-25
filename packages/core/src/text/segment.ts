import { abbreviationsFor } from './abbreviations';

export interface Span {
  start: number;
  end: number;
}

const TERMINALS = new Set(['.', '!', '?', '…', '‼', '⁇', '⁈', '⁉', '。', '！', '？', '।', '؟']);
const CJK_TERMINALS = new Set(['。', '！', '？']);
const CLOSERS = new Set(['"', "'", '”', '’', '»', ')', ']', '}', '›', '」', '』']);
const OPENERS = new Set(['"', "'", '“', '‘', '«', '(', '[', '{', '‹', '¿', '¡', '「', '『', '—', '–']);

/** Abbreviations that are followed by a name, number or example, so they never end a sentence. */
const NEVER_END = new Set([
  'e.g',
  'i.e',
  'cf',
  'vs',
  'no',
  'nos',
  'p',
  'pp',
  'fig',
  'figs',
  'vol',
  'vols',
  'approx',
  'ca',
  'z.b',
  'd.h',
  'vgl',
  'bzw',
  'p.ej',
  'p.ex',
  'núm',
  'nr',
  'art',
  'cap',
  'ch',
  'chap',
  'sec',
  'pág',
  'págs',
  'ext',
  'tel',
]);

/** English letter names as Hindi writes them, used as initials ("ए. के. शर्मा"). */
// prettier-ignore
const HINDI_INITIALS = new Set(['ए', 'बी', 'सी', 'डी', 'ई', 'एफ', 'जी', 'एच', 'आई', 'जे', 'के', 'एल', 'एम', 'एन', 'ओ', 'पी', 'क्यू', 'आर', 'एस', 'टी', 'यू', 'वी', 'डब्ल्यू', 'एक्स', 'वाई', 'ज़ेड', 'जेड']);

const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c);
const isLower = (c: string) => c !== c.toUpperCase() && c === c.toLowerCase();
const isUpper = (c: string) => c !== c.toLowerCase() && c === c.toUpperCase();
const isDigit = (c: string) => c >= '0' && c <= '9';
/** A letter of a script without capitals (Devanagari, Arabic, Thai…), where case can't tell a sentence start. */
const isCaseless = (c: string) => /\p{L}/u.test(c) && !isUpper(c) && !isLower(c);

/** The word immediately before position `i` (exclusive), without leading opening punctuation. */
function wordBefore(text: string, i: number): string {
  let s = i;
  while (s > 0 && !isSpace(text[s - 1]) && !OPENERS.has(text[s - 1] ?? '')) s--;
  return text.slice(s, i);
}

/**
 * Multi-part abbreviations written with or without spaces ("z. B.", "d.h.", "e. g."): returns the lowercase,
 * space-free forms that a period at `i` could belong to — the part ending here and the part continuing after.
 */
function dottedForms(text: string, i: number): string[] {
  const back = /((?:\p{L}\.\s?){0,3}\p{L})$/u.exec(text.slice(Math.max(0, i - 12), i))?.[1] ?? '';
  const ahead = /^\s?(\p{L})\.(?!\p{L}{2})/u.exec(text.slice(i + 1, i + 4))?.[1];
  const base = back.replace(/\s/g, '').toLowerCase();
  return ahead ? [base, `${base}.${ahead.toLowerCase()}`] : [base];
}

/** First visible character at or after `i`, skipping whitespace and opening punctuation. */
function nextVisible(text: string, i: number): string | undefined {
  let k = i;
  while (k < text.length && (isSpace(text[k]) || OPENERS.has(text[k] ?? ''))) k++;
  return text[k];
}

/**
 * Splits `text` into sentences. Language-aware for abbreviations; works for caseless scripts and CJK.
 * Returned spans are trimmed of surrounding whitespace and cover every non-space character exactly once.
 */
export function splitSentences(text: string, lang = 'en'): Span[] {
  const { titles, general } = abbreviationsFor(lang);
  const spans: Span[] = [];
  let start = 0;

  const push = (end: number) => {
    let s = start;
    let e = end;
    while (s < e && isSpace(text[s])) s++;
    while (e > s && isSpace(text[e - 1])) e--;
    if (e > s) spans.push({ start: s, end: e });
    start = end;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i] ?? '';
    if (!TERMINALS.has(c)) continue;

    let j = i + 1;
    while (j < text.length && TERMINALS.has(text[j] ?? '')) j++;
    while (j < text.length && CLOSERS.has(text[j] ?? '')) j++;

    if (CJK_TERMINALS.has(c)) {
      push(j);
      i = j - 1;
      continue;
    }
    if (j < text.length && !isSpace(text[j])) continue; // "3.14", "U.S.A", "e.g.,"

    const next = nextVisible(text, j);
    if (next === undefined) {
      push(j);
      break;
    }
    if (isLower(next)) continue; // "Wait... then", "¿Qué? dijo él", "etc. and"

    const ellipsis = c === '…' || text.slice(i, i + 3) === '...';
    // Caseless scripts end sentences with their own marks (।, ؟), so a trailing-off "..." there runs on.
    if (
      ellipsis &&
      isCaseless(next) &&
      /[\p{L}\p{M}]/u.test(text[i - 1] ?? '') &&
      !isUpper(text[i - 1] ?? '')
    ) {
      i = j - 1;
      continue;
    }
    if (c === '.' && !ellipsis && j === i + 1) {
      const word = wordBefore(text, i).toLowerCase();
      if (titles.has(word) || NEVER_END.has(word)) continue;
      const dotted = dottedForms(text, i).filter((f) => f.includes('.'));
      if (dotted.some((f) => NEVER_END.has(f) || titles.has(f))) continue;
      if (dotted.some((f) => general.has(f)) && !isUpper(next)) continue;
      if (word.length === 1 && isUpper(word.toUpperCase()) && isUpper(wordBefore(text, i))) continue; // initials
      if (general.has(word) && !isUpper(next)) continue;
      // Run-together initials before a name ("J.R.R. Tolkien"); listed ones like "U.S." are judged above.
      if (
        /^(?:\p{Lu}\.)+\p{Lu}$/u.test(wordBefore(text, i)) &&
        !dotted.some((f) => general.has(f)) &&
        isUpper(next)
      )
        continue;
      if (HINDI_INITIALS.has(word) && isCaseless(next)) continue;
      if (/^\d+$/.test(word) && text.slice(start, i).trim() === word) continue; // "1. First item"
      if (isDigit(next) && /^[ivxlcdm]+$/.test(word)) continue; // "vol. iv. 3"
    }
    push(j);
    i = j - 1;
  }
  push(text.length);
  return spans;
}

const BREAKS: readonly RegExp[] = [/[;:](?=\s)/g, /\s[—–]\s/g, /,(?=\s)/g, /\s/g];

/**
 * Splits spans longer than `maxLen` characters at the most natural break near the middle:
 * semicolons and colons first, then dashes, then commas, then any space.
 */
export function splitLong(text: string, span: Span, maxLen = 280, minLen = 40): Span[] {
  if (span.end - span.start <= maxLen) return [span];
  const slice = text.slice(span.start, span.end);
  const mid = slice.length / 2;
  for (const re of BREAKS) {
    let best = -1;
    for (const m of slice.matchAll(re)) {
      const at = m.index + m[0].length;
      if (at < minLen || slice.length - at < minLen) continue;
      if (best < 0 || Math.abs(at - mid) < Math.abs(best - mid)) best = at;
    }
    if (best > 0) {
      let leftEnd = span.start + best;
      while (leftEnd > span.start && isSpace(text[leftEnd - 1])) leftEnd--;
      let rightStart = span.start + best;
      while (rightStart < span.end && isSpace(text[rightStart])) rightStart++;
      return [
        ...splitLong(text, { start: span.start, end: leftEnd }, maxLen, minLen),
        ...splitLong(text, { start: rightStart, end: span.end }, maxLen, minLen),
      ];
    }
  }
  return [span]; // one giant word: nothing sensible to split on
}

/** Sentences of `text`, with overlong ones split for speech. */
export function segment(text: string, lang = 'en', maxLen = 280): Span[] {
  return splitSentences(text, lang).flatMap((s) => splitLong(text, s, maxLen));
}
