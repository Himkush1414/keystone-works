import { defaultCleanSettings, parsePlainText, prepareDocument, type Block } from '@lamplight/core';
import { describe, expect, it } from 'vitest';
import { blockOfSentence, paragraphJump, readAlongBlocks, wordTimesFor } from '../src/player/readAlong';

const CLEAN = defaultCleanSettings('document', false);

/** Element `i` (negative counts from the end), failing the test clearly when it's missing. */
function at<T>(xs: readonly T[], i: number): T {
  const x = xs.at(i);
  if (x === undefined) throw new Error(`no element at ${i}`);
  return x;
}

function doc(text: string) {
  const p = prepareDocument(parsePlainText(text, 'T'));
  return { blocks: p.draft.blocks, sentences: p.sentences };
}

/** The text of each run, tagged with its sentence and skip state, for readable assertions. */
const show = (b: {
  text: string;
  runs: { start: number; end: number; sentence: number | null; skipped: boolean }[];
}) => b.runs.map((r) => `${r.sentence ?? '-'}${r.skipped ? '!' : ''}:${b.text.slice(r.start, r.end)}`);

describe('readAlongBlocks', () => {
  it('cuts each block into its sentences, with the spaces between them unowned', () => {
    const { blocks, sentences } = doc('One sentence here. Another one.\n\nSecond paragraph.');
    const read = readAlongBlocks(blocks, sentences, CLEAN);
    expect(show(at(read, 0))).toEqual(['0:One sentence here.', '-: ', '1:Another one.']);
    expect(show(at(read, 1))).toEqual(['2:Second paragraph.']);
    expect(read.map((b) => b.firstSentence)).toEqual([0, 2]);
  });

  it('marks text that Clean Read skips, inside a sentence', () => {
    const { blocks, sentences } = doc('Readers agree [12] on this.');
    const read = readAlongBlocks(blocks, sentences, { ...CLEAN, citation: true });
    expect(show(at(read, 0))).toEqual(['0:Readers agree ', '0!:[12]', '0: on this.']);
    const kept = readAlongBlocks(blocks, sentences, { ...CLEAN, citation: false });
    expect(show(at(kept, 0))).toEqual(['0:Readers agree [12] on this.']);
  });

  it('marks emphasised text as its own run, without the underscores', () => {
    const { blocks, sentences } = doc('He _may_ fall in love. Then _you_ must go.');
    const read = readAlongBlocks(blocks, sentences, CLEAN);
    const b = at(read, 0);
    expect(b.text).toBe('He may fall in love. Then you must go.');
    expect(
      b.runs.filter((r) => r.emphasis).map((r) => `${r.sentence}:${b.text.slice(r.start, r.end)}`),
    ).toEqual(['0:may', '1:you']);
  });

  it('covers every character of every block exactly once', () => {
    const { blocks, sentences } = doc('A [1] b. C d.\n\nE (Smith, 2020) f.');
    for (const b of readAlongBlocks(blocks, sentences, { ...CLEAN, citation: true })) {
      expect(b.runs.map((r) => b.text.slice(r.start, r.end)).join('')).toBe(b.text);
    }
  });

  it('keeps blocks with nothing spoken, such as a page break', () => {
    const blocks: Block[] = [{ kind: 'pagebreak', text: '', skips: [] }];
    expect(readAlongBlocks(blocks, [], CLEAN)).toEqual([
      { index: 0, kind: 'pagebreak', text: '', runs: [], firstSentence: -1 },
    ]);
  });
});

describe('blockOfSentence', () => {
  it('finds the block to scroll to, clamping out-of-range indices', () => {
    const { sentences } = doc('One. Two.\n\nThree.');
    expect([0, 1, 2, 99, -5].map((i) => blockOfSentence(sentences, i))).toEqual([0, 0, 1, 1, 0]);
  });
});

describe('wordTimesFor', () => {
  it('times the words of a sentence across its length, in order', () => {
    const { blocks, sentences } = doc('The lamp was lit in 1984.');
    const times = wordTimesFor(at(blocks, 0), at(sentences, 0), 'en', 3_000, { clean: CLEAN });
    expect(times.map((w) => at(blocks, 0).text.slice(w.start, w.end))).toEqual([
      'The',
      'lamp',
      'was',
      'lit',
      'in',
      '1984',
    ]);
    expect(times.every((w, k) => k === 0 || w.t0 >= (times[k - 1]?.t1 ?? 0) - 1)).toBe(true);
    // "1984" is spoken as several words, so it gets more time than "in".
    expect(at(times, 5).t1 - at(times, 5).t0).toBeGreaterThan(at(times, 4).t1 - at(times, 4).t0);
    expect(at(times, -1).t1).toBeLessThanOrEqual(3_000);
  });
});

describe('paragraphJump', () => {
  // Paragraphs (blocks) 0, 2 and 3 hold sentences 0–2, 3–4 and 5.
  const sentences = [0, 0, 0, 2, 2, 3].map((block) => ({ block }));

  it('goes forward to the next paragraph, and stays in the last one', () => {
    expect(paragraphJump(sentences, 1, 1)).toBe(3);
    expect(paragraphJump(sentences, 3, 1)).toBe(5);
    expect(paragraphJump(sentences, 5, 1)).toBe(5);
  });

  it('goes back to the start of this paragraph, then to the one before', () => {
    expect(paragraphJump(sentences, 4, -1)).toBe(3);
    expect(paragraphJump(sentences, 3, -1)).toBe(0);
    expect(paragraphJump(sentences, 2, -1)).toBe(0);
    expect(paragraphJump(sentences, 0, -1)).toBe(0);
  });

  it('copes with an empty text and an index past the end', () => {
    expect(paragraphJump([], 4, 1)).toBe(0);
    expect(paragraphJump(sentences, 99, -1)).toBe(3);
  });
});
