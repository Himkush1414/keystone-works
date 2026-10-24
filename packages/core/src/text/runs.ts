import { hinglishWord } from './hinglish';

/** A stretch of a line in one voice language (Chunks.split in the Kotlin engine renders each on its own). */
export interface LanguageRun {
  text: string;
  lang: string;
}

/** English phrases this long or longer inside a Hindi line go to the English voice; shorter ones stay. */
export const ENGLISH_PHRASE_WORDS = 3;

const DEVANAGARI = /\p{Script=Devanagari}/u;
const LATIN = /\p{Script=Latin}/u;

/**
 * Splits a spoken line into runs that each voice language reads best. The Hindi voice reads a loanword or a
 * name inside a Hindi sentence ("उसने अपना phone उठाया", "Aarav ने कहा") the way a Hindi speaker would, so
 * those stay in the Hindi run; a whole English phrase (three words or more) gets the English voice. In a line
 * in any Latin-script language, Devanagari always gets the Hindi voice, which is the only one that can read
 * it. Punctuation and spaces stay with the run before them, so a cut falls after the comma, where the pause
 * is. Returns undefined when the line is in one language throughout.
 */
export function languageRuns(text: string, lang: string): LanguageRun[] | undefined {
  const base = lang.slice(0, 2);
  // Words with the script they're in; anything else (spaces, punctuation, digits) joins the word before it.
  const tokens = text.match(/[\p{L}\p{M}'’]+|[^\p{L}\p{M}'’]+/gu) ?? [];
  const words = tokens.map((t) => (DEVANAGARI.test(t) ? 'deva' : LATIN.test(t) ? 'latin' : 'other'));
  const langs = new Array<string>(tokens.length).fill(base);
  if (base === 'hi') {
    // Runs of English words (allowing spaces and punctuation between them) long enough to be a phrase.
    for (let k = 0; k < tokens.length;) {
      if (words[k] !== 'latin' || hinglishWord(tokens[k] ?? '')) {
        k++;
        continue;
      }
      let end = k;
      let count = 0;
      for (let j = k; j < tokens.length; j++) {
        if (words[j] === 'deva' || (words[j] === 'latin' && hinglishWord(tokens[j] ?? ''))) break;
        if (words[j] === 'latin') {
          count++;
          end = j;
        }
      }
      if (count >= ENGLISH_PHRASE_WORDS) for (let j = k; j <= end; j++) langs[j] = 'en';
      k = end + 1;
    }
  } else if (LATIN.test(text)) {
    tokens.forEach((_, k) => {
      if (words[k] === 'deva') langs[k] = 'hi';
    });
  } else {
    return undefined;
  }
  // Spaces and punctuation belong to the run before them (leading ones to the first run).
  for (let k = 0; k < tokens.length; k++) {
    if (words[k] === 'other')
      langs[k] = k > 0 ? (langs[k - 1] ?? base) : (langs[words.findIndex((w) => w !== 'other')] ?? base);
  }
  const runs: LanguageRun[] = [];
  tokens.forEach((t, k) => {
    const l = langs[k] ?? base;
    const last = runs.at(-1);
    if (last && last.lang === l) last.text += t;
    else runs.push({ text: t, lang: l });
  });
  return runs.length > 1 ? runs : undefined;
}
