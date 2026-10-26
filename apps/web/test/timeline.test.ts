import { describe, expect, it } from 'vitest';
import { SAMPLES, clock } from '../lib/samples';
import { flatten, sentenceAt, speakerLabels } from '../lib/timeline';

describe('the sample library', () => {
  it('has English and Hindi samples whose sentences are timed in order, inside the audio', () => {
    expect(new Set(SAMPLES.map((s) => s.lang))).toEqual(new Set(['en', 'hi']));
    for (const sample of SAMPLES) {
      const all = flatten(sample);
      expect(all.length, sample.id).toBeGreaterThan(5);
      all.forEach((s, i) => {
        expect(s.end, `${sample.id} #${i}`).toBeGreaterThan(s.start);
        if (i) expect(s.start, `${sample.id} #${i}`).toBeGreaterThanOrEqual(all[i - 1]?.end ?? 0);
      });
      expect(all.at(-1)?.end ?? Infinity).toBeLessThanOrEqual(sample.durationMs);
    }
  });

  it('keeps every sample short: a taste, never a book', () => {
    for (const s of SAMPLES) expect(s.durationMs, s.id).toBeLessThan(120_000);
  });
});

describe('sentenceAt', () => {
  const s = [{ start: 0 }, { start: 1000 }, { start: 2500 }];
  it('finds the sentence being spoken, holding the last one through a pause', () => {
    expect(sentenceAt(s, -5)).toBe(-1);
    expect(sentenceAt(s, 0)).toBe(0);
    expect(sentenceAt(s, 999)).toBe(0);
    expect(sentenceAt(s, 1000)).toBe(1);
    expect(sentenceAt(s, 9999)).toBe(2);
  });
});

describe('speakerLabels', () => {
  it('labels the first sentence of each turn, with a stable colour per character', () => {
    const pride = SAMPLES.find((x) => x.id === 'pride-and-prejudice');
    if (!pride) throw new Error('missing sample');
    const all = flatten(pride);
    const labels = [...speakerLabels(all).entries()];
    expect(labels[0]?.[1]).toEqual({ name: 'Mrs. Bennet', slot: 0 });
    const mr = labels.find(([, l]) => l.name === 'Mr. Bennet');
    expect(mr?.[1].slot).toBe(1);
    // A turn continued in the same paragraph isn't labelled again.
    const firstTurn = labels[0]?.[0] ?? 0;
    expect(labels.some(([i]) => i === firstTurn + 1)).toBe(false);
  });

  it('labels a line no one was named for, without a colour', () => {
    const alice = SAMPLES.find((x) => x.id === 'alice-tea-party');
    if (!alice) throw new Error('missing sample');
    const unknown = [...speakerLabels(flatten(alice)).values()].filter((l) => l.name === null);
    expect(unknown).toEqual([{ name: null, slot: -1 }]);
  });
});

describe('clock', () => {
  it('formats minutes and seconds', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(87_700)).toBe('1:28');
  });
});
