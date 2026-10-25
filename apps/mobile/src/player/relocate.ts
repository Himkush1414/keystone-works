import type { Block, Sentence } from '@lamplight/core';

interface Doc {
  blocks: readonly Block[];
  sentences: readonly Sentence[];
}

/**
 * Where sentence `index` of `before` is in `after`, the same document laid out again (a long PDF plays from
 * its first pages, then the whole book replaces them and sentence numbers can shift). Found by the text of its
 * paragraph and its place in it, searching from the same paragraph outwards; the same number when it's gone.
 */
export function relocateSentence(before: Doc, after: Doc, index: number): number {
  const s = before.sentences[index];
  const text = s ? before.blocks[s.block]?.text : undefined;
  const fallback = Math.min(Math.max(0, index), Math.max(0, after.sentences.length - 1));
  if (!s || text === undefined) return fallback;
  const near = (bi: number) => after.blocks[bi]?.text === text;
  let block = -1;
  for (let d = 0; d < after.blocks.length && block < 0; d++) {
    if (near(s.block + d)) block = s.block + d;
    else if (d > 0 && near(s.block - d)) block = s.block - d;
  }
  if (block < 0) {
    // The paragraph changed (say it now runs on from the next page): find the sentence's own words.
    const words = text.slice(s.start, s.end).trim();
    block = words ? after.blocks.findIndex((b) => b.text.includes(words)) : -1;
    if (block < 0) return fallback;
    const at = (after.blocks[block]?.text ?? '').indexOf(words);
    const k = after.sentences.findIndex((x) => x.block === block && x.start <= at && at < x.end);
    return k < 0 ? fallback : k;
  }
  const k = after.sentences.findIndex((x) => x.block === block && x.start <= s.start && s.start < x.end);
  return k < 0 ? fallback : k;
}
