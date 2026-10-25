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
  // A paragraph that opens a quotation and never closes it goes on speaking to its end: books leave the
  // closing mark off every paragraph of a speech but the last.
  const lead = /^\s*([“"‘'«„])/u.exec(text);
  if (lead && !spans.some((s) => s.start === lead.index + lead[0].length - 1)) {
    const at = lead.index + lead[0].length - 1;
    const straightSingle = lead[1] === "'" && !/['’]\s*$/u.test(text);
    if (!straightSingle) spans.push({ start: at, end: text.trimEnd().length });
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

/**
 * Hindi dialogue without quotation marks, as Premchand and much printed Hindi write it. Speech follows
 * - a speaker's name and a dash at the start of a sentence: "मोहसिन—हाँ…", "महमूद ---और…";
 * - a speech verb and a dash or a comma: "महमूद ने कहा—…", "मोहसिन बोला—…", "खालाने नम्रतासे कहा, …";
 * - a clause ending in a verb and a long dash: "हामिद को यकीन न आया—…", "…निन्दा करता है---…"
 * and runs to the next such opening or the end of the paragraph. A single en dash (–) is left to narration.
 */
const HI_SAY =
  '(?:कहा|कही|कहे|कहता|कहती|कहते|कहेगा|कहेगी|कहेंगे|कहने\\s+लग[ाीे]|बोला|बोली|बोले|बोलीं|वोले|पूछा|पूछी|पूछे|जवाब\\s+दिया|उत्तर\\s+दिया|चिल्लाया|चिल्लाई|चिल्लाकर\\s+कहा|चीखा|चीखी|सुनाया|फुसफुसाया|फुसफुसाई|बड़बड़ाया|kaha|bola|boli|bole|poocha|pucha)(?:\\s+(?:है|हैं|था|थी|थे))?';
const DASH = '(?:\\s*(?:[—―]+[-–]*|-{2,}[–—]*|–{2,})\\s*)';
const SENTENCE_START = '(?:^|[।?!॥]\\s*)[\\s\\u200b\\u2060]*';
const HI_OPENERS = [
  // a name (one or two words) and a dash, opening a sentence
  new RegExp(`${SENTENCE_START}([\\p{L}\\p{M}]+(?:\\s[\\p{L}\\p{M}]+)?)${DASH}`, 'gu'),
  // a speech verb and a dash, or a comma
  new RegExp(`${HI_SAY}\\s*,?${DASH}|${HI_SAY}\\s*,\\s+`, 'gu'),
  // a clause ending in a verb, then a long dash
  new RegExp(`(?:[ाीेैंई]|या|ये|है|हैं|था|थी|थे)${DASH}`, 'gu'),
];

function hindiSpans(text: string): DialogueSpan[] {
  const openings: { at: number; end: number }[] = [];
  for (const re of HI_OPENERS) {
    for (const m of text.matchAll(re)) {
      const at = m.index;
      const end = at + m[0].length;
      // Only a long dash or a speech verb's comma opens speech, never a hyphen ("दस-बारह").
      if (!/[—―]|--|–{2}/u.test(m[0]) && !/,\s+$/u.test(m[0])) continue;
      openings.push({ at, end });
    }
  }
  openings.sort((a, b) => a.end - b.end);
  const spans: DialogueSpan[] = [];
  openings.forEach((o, k) => {
    const next = openings.slice(k + 1).find((n) => n.end > o.end + 1);
    const stop = next ? sentenceStartBefore(text, next.at, o.end) : text.trimEnd().length;
    if (stop - o.end > 1 && /\p{L}/u.test(text.slice(o.end, stop))) spans.push({ start: o.end, end: stop });
  });
  // Later openings cut the earlier speech short; keep spans in order without overlap.
  const out: DialogueSpan[] = [];
  for (const s of spans.sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && s.start < last.end) last.end = Math.max(last.start + 1, s.start);
    out.push({ ...s });
  }
  return out.filter((s) => /\p{L}/u.test(text.slice(s.start, s.end)));
}

/** Where the sentence holding position `at` begins (not before `floor`): the narration before an opening. */
function sentenceStartBefore(text: string, at: number, floor: number): number {
  for (let i = at - 1; i > floor; i--) if ('।?!॥'.includes(text[i] ?? '')) return i + 1;
  return at;
}

/** Dialogue spans in `text` for language `lang`, sorted and non-overlapping. */
export function findDialogue(text: string, lang = 'en'): DialogueSpan[] {
  const base = lang.slice(0, 2);
  const raw = [
    ...pairedSpans(text),
    ...(DASH_LANGS.has(base) ? dashSpans(text) : []),
    ...(base === 'hi' ? hindiSpans(text) : []),
  ]
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
