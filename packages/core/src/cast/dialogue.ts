/** Finds spoken dialogue inside a paragraph. Returns spans that include their quote marks. */

export interface DialogueSpan {
  start: number;
  end: number;
}

const PAIRS: [open: string, close: string][] = [
  ['“', '”'],
  ['«', '»'],
  ['„', '“'],
  ['„', '”'],
  ['‹', '›'],
  ['「', '」'],
  ['『', '』'],
];

const DASH_LANGS = new Set([
  'es',
  'fr',
  'it',
  'pt',
  'ru',
  'uk',
  'bg',
  'pl',
  'cs',
  'sk',
  'hr',
  'sl',
  'ro',
  'el',
  'tr',
]);
const isLetter = (c: string | undefined) => !!c && /\p{L}/u.test(c);

/** Quoted text that's really a scare quote or a title, not someone speaking. */
function looksLikeScareQuote(text: string, span: DialogueSpan): boolean {
  const inner = text.slice(span.start + 1, span.end - 1).trim();
  const words = inner.split(/\s+/).filter(Boolean).length;
  if (words > 3) return false;
  if (/[.!?,…]$/.test(inner)) return false;
  const before = text.slice(Math.max(0, span.start - 2), span.start);
  return /\p{L}\s$/u.test(before) || /^[\p{Ll}]/u.test(inner);
}

function pairedSpans(text: string): DialogueSpan[] {
  const spans: DialogueSpan[] = [];
  for (const [open, close] of PAIRS) {
    let i = text.indexOf(open);
    while (i >= 0) {
      const j = text.indexOf(close, i + 1);
      if (j < 0) break;
      spans.push({ start: i, end: j + 1 });
      i = text.indexOf(open, j + 1);
    }
  }
  // Straight double quotes alternate open/close.
  const straight = [...text.matchAll(/"/g)].map((m) => m.index);
  for (let k = 0; k + 1 < straight.length; k += 2)
    spans.push({ start: straight[k] ?? 0, end: (straight[k + 1] ?? 0) + 1 });
  // British single quotes: ‘…’ where the closing ’ isn't an apostrophe inside a word.
  for (let i = text.indexOf('‘'); i >= 0; i = text.indexOf('‘', i + 1)) {
    if (isLetter(text[i - 1])) continue;
    let j = text.indexOf('’', i + 1);
    while (j >= 0 && isLetter(text[j - 1]) && isLetter(text[j + 1])) j = text.indexOf('’', j + 1);
    if (j < 0) break;
    spans.push({ start: i, end: j + 1 });
    i = j;
  }
  return spans;
}

/** Em-dash dialogue: "—Hola —dijo Juan—. ¿Qué tal?" → the speech parts. */
function dashSpans(text: string): DialogueSpan[] {
  const lead = /^\s*[—―–]\s*/u.exec(text);
  if (!lead) return [];
  const spans: DialogueSpan[] = [];
  let start = lead.index;
  let speaking = true;
  const dashes = [...text.matchAll(/\s[—―–]|[—―–](?=[\s.,;:!?]|$)/gu)].map(
    (m) => m.index + (m[0].startsWith(' ') ? 1 : 0),
  );
  for (const d of dashes) {
    if (d <= start) continue;
    if (speaking) {
      spans.push({ start, end: d });
      speaking = false;
    } else {
      // An inciso ends at the next dash; speech resumes after following punctuation.
      const resume = /^[—―–][.,;:]?\s*/u.exec(text.slice(d));
      start = d + (resume ? resume[0].length : 1);
      speaking = true;
    }
  }
  if (speaking && start < text.trimEnd().length) spans.push({ start, end: text.trimEnd().length });
  return spans.filter((s) => /\p{L}/u.test(text.slice(s.start, s.end)));
}

/** Dialogue spans in `text` for language `lang`, sorted and non-overlapping. */
export function findDialogue(text: string, lang = 'en'): DialogueSpan[] {
  const base = lang.slice(0, 2);
  const raw = [...pairedSpans(text), ...(DASH_LANGS.has(base) ? dashSpans(text) : [])]
    .filter((s) => s.end - s.start > 2)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const out: DialogueSpan[] = [];
  for (const s of raw) {
    const last = out[out.length - 1];
    if (last && s.start < last.end) continue; // nested or overlapping: keep the outer span
    if (
      text[s.start] !== '—' &&
      text[s.start] !== '―' &&
      text[s.start] !== '–' &&
      looksLikeScareQuote(text, s)
    )
      continue;
    out.push(s);
  }
  return out;
}
