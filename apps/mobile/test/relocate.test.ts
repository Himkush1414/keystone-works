import type { Block, Sentence } from '@lamplight/core';
import { describe, expect, it } from 'vitest';
import { relocateSentence } from '../src/player/relocate';

const block = (text: string): Block => ({ kind: 'paragraph', text, skips: [] });
const sentences = (blocks: Block[]): Sentence[] =>
  blocks.flatMap((b, bi) => {
    const out: Sentence[] = [];
    const re = /[^.!?।]+[.!?।]\s*/gu;
    for (const m of b.text.matchAll(re))
      out.push({ block: bi, start: m.index, end: m.index + m[0].length, kind: 'narration', pauseMs: 140 });
    return out;
  });

describe('relocateSentence', () => {
  const first = [block('Chapter one.'), block('The lamp was lit. She read aloud.'), block('It rained.')];
  const before = { blocks: first, sentences: sentences(first) };

  it('finds the same sentence when more paragraphs came before it', () => {
    const whole = [block('Contents.'), block('Preface. Notes.'), ...first, block('More pages.')];
    const after = { blocks: whole, sentences: sentences(whole) };
    // "She read aloud." was sentence 2; three sentences now come before its paragraph.
    expect(relocateSentence(before, after, 2)).toBe(5);
    expect(after.sentences[5] && whole[after.sentences[5].block]?.text.slice(after.sentences[5].start)).toBe(
      'She read aloud.',
    );
  });

  it('follows a paragraph that grew (it now runs on from the next page)', () => {
    const whole = [block('Chapter one.'), block('The lamp was lit. She read aloud. And on.'), block('It rained.')];
    expect(relocateSentence(before, { blocks: whole, sentences: sentences(whole) }, 2)).toBe(2);
  });

  it('works in Hindi', () => {
    const hi = [block('रमज़ान के बाद आज ईद आई है। कितना मनोहर प्रभात है।')];
    const whole = [block('भूमिका।'), ...hi];
    expect(relocateSentence({ blocks: hi, sentences: sentences(hi) }, { blocks: whole, sentences: sentences(whole) }, 1)).toBe(2);
  });

  it('keeps the number when the sentence is gone', () => {
    const other = [block('Something else entirely.'), block('And more.')];
    expect(relocateSentence(before, { blocks: other, sentences: sentences(other) }, 1)).toBe(1);
  });
});
