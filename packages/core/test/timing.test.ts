import { describe, expect, it } from 'vitest';
import { normalize } from '../src/text/normalize';
import { estimateWordTimes, syllables, wordAt } from '../src/text/timing';

const times = (text: string, ms: number, lang = 'en') =>
  estimateWordTimes(normalize(text, { start: 0, end: text.length }, lang), text, ms);

describe('syllables', () => {
  it.each([
    ['cat', 1],
    ['lamp', 1],
    ['window', 2],
    ['beautiful', 3],
    ['make', 1],
    ['naïve', 2],
    ['東京', 2],
    ['', 0],
  ])('%s → %i', (w, n) => expect(syllables(w)).toBe(n));
});

describe('estimateWordTimes', () => {
  it('is monotonic, non-overlapping and inside the sentence', () => {
    const t = times('The lamp was still burning when she reached the last page.', 4000);
    expect(t).toHaveLength(11);
    for (let i = 0; i < t.length; i++) {
      const w = t[i];
      expect(w).toBeDefined();
      if (!w) continue;
      expect(w.t1).toBeGreaterThanOrEqual(w.t0);
      if (i > 0) expect(w.t0).toBeGreaterThanOrEqual(t[i - 1]?.t1 ?? 0);
    }
    expect(t[0]?.t0).toBeGreaterThan(0);
    expect(t[t.length - 1]?.t1).toBeLessThanOrEqual(4000);
  });

  it('gives words before punctuation extra time for the pause', () => {
    const t = times('One, two three.', 3000);
    const one = (t[0]?.t1 ?? 0) - (t[0]?.t0 ?? 0);
    const two = (t[1]?.t1 ?? 0) - (t[1]?.t0 ?? 0);
    expect(one).toBeGreaterThan(two * 1.8);
  });

  it('maps spoken expansions to the whole display range', () => {
    const text = 'Born in 1984 here.';
    const t = times(text, 3000);
    const year = t.find((w) => text.slice(w.start, w.end) === '1984');
    expect(year).toBeDefined();
    // "nineteen eighty-four" is long: it should take more time than "Born".
    expect((year?.t1 ?? 0) - (year?.t0 ?? 0)).toBeGreaterThan((t[0]?.t1 ?? 0) - (t[0]?.t0 ?? 0));
  });

  it('never gives punctuation a slot of its own; its pause goes to the word before', () => {
    for (const text of ['Born in 1984.', 'Wait — what?']) {
      const t = times(text, 3000);
      expect(t.every((w) => /[\p{L}\p{N}]/u.test(text.slice(w.start, w.end)))).toBe(true);
    }
    const t = times('Born in 1984.', 3000);
    const year = t.at(-1);
    const born = t[0];
    expect(text(year)).toBe('1984');
    // The final stop's pause lengthens "1984" rather than standing alone.
    expect((year?.t1 ?? 0) - (year?.t0 ?? 0)).toBeGreaterThan(2 * ((born?.t1 ?? 0) - (born?.t0 ?? 0)));
    function text(w: { start: number; end: number } | undefined) {
      return w ? 'Born in 1984.'.slice(w.start, w.end) : '';
    }
  });

  it('ignores skipped spans', () => {
    const text = 'Glow [12] softly.';
    const s = normalize(text, { start: 0, end: text.length }, 'en', {
      skips: [{ start: 5, end: 9, reason: 'citation' }],
    });
    const t = estimateWordTimes(s, text, 2000);
    expect(t.map((w) => text.slice(w.start, w.end))).toEqual(['Glow', 'softly.']);
  });

  it('returns nothing for empty speech', () => {
    expect(times('', 1000)).toEqual([]);
  });
});

describe('wordAt', () => {
  it('finds the word being spoken', () => {
    const t = times('Alpha beta gamma.', 3000);
    expect(wordAt(t, 0)).toBe(-1);
    expect(wordAt(t, t[1]?.t0 ?? 0)).toBe(1);
    expect(wordAt(t, 2999)).toBe(2);
  });
});
