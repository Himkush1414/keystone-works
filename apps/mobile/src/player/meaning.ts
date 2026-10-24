import { explain, lookupRequest, type LookupRows, type Meaning } from '@lamplight/core';

export interface DictionaryEngine {
  lookupWord(request: string): Promise<string>;
}

/** The meaning of [word] where it was heard ([context]: its paragraph), from the on-device dictionary. */
export async function lookUpWord(
  engine: DictionaryEngine,
  word: string,
  context: string,
): Promise<Meaning | null> {
  const request = lookupRequest(word);
  if (!request) return null;
  const rows = JSON.parse(await engine.lookupWord(JSON.stringify(request))) as LookupRows;
  return explain(word, context, rows);
}

export interface SentenceToken {
  text: string;
  /** A word the listener can ask about (not a space or punctuation). */
  word: boolean;
}

/** A sentence cut into words and the bits between them, in order, so the sheet can show it as written. */
export function sentenceTokens(text: string): SentenceToken[] {
  return (text.match(/[\p{L}\p{M}][\p{L}\p{M}'’-]*|[^\p{L}\p{M}]+/gu) ?? []).map((t) => ({
    text: t,
    word: /^[\p{L}\p{M}]/u.test(t),
  }));
}
