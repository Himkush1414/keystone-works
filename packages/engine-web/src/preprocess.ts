/**
 * Text preparation for the Supertonic 3 voice model.
 *
 * The replacement table and the language tag wrapping follow Supertone's MIT-licensed reference
 * implementation (github.com/supertone-inc/supertonic, Copyright (c) 2025 Supertone Inc.). Lamplight's own
 * normaliser (packages/core) has already expanded numbers and abbreviations before text reaches here.
 */

// prettier-ignore
export const MODEL_LANGUAGES = [
  'en', 'ko', 'ja', 'ar', 'bg', 'cs', 'da', 'de', 'el', 'es', 'et', 'fi', 'fr', 'hi', 'hr', 'hu',
  'id', 'it', 'lt', 'lv', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'tr', 'uk', 'vi',
] as const;

const REPLACEMENTS: [RegExp, string][] = [
  [/[–‑—]/g, '-'],
  [/_/g, ' '],
  [/[“”]/g, '"'],
  [/[‘’´`]/g, "'"],
  [/[[\]|/#→←]/g, ' '],
  [/[♥☆♡©\\]/g, ''],
];

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]|\u{FE0F}|\u{200D}/gu;

/** Model-ready text: NFKD, simplified punctuation, tidy spacing, final punctuation, language tags. */
export function prepareForModel(text: string, lang: string): string {
  const base = (MODEL_LANGUAGES as readonly string[]).includes(lang.slice(0, 2)) ? lang.slice(0, 2) : 'en';
  let t = text.normalize('NFKD').replace(EMOJI, '');
  for (const [re, to] of REPLACEMENTS) t = t.replace(re, to);
  t = t
    .replace(/\s+([,.!?;:'])/g, '$1')
    .replace(/"{2,}/g, '"')
    .replace(/'{2,}/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (t && !/[.!?;:,'")\]}…。」』】〉》›»]$/u.test(t)) t += '.';
  return `<${base}>${t}</${base}>`;
}
