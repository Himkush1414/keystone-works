import { describe, expect, it } from 'vitest';
import { estimateSpeechMs, Timeline } from '../src/player/timeline';

const seg = (text: string, pauseMs = 0) => ({
  i: 0,
  text,
  lang: 'en',
  voice: 'F1',
  pauseMs,
  kind: 'narration',
});

// 30 characters → 2000 ms each, so the arithmetic below stays readable.
const line = 'x'.repeat(30);

describe('estimateSpeechMs', () => {
  it('matches the native estimate: 15 characters per second, at least 400 ms, silent when blank', () => {
    expect(estimateSpeechMs(line)).toBe(2000);
    expect(estimateSpeechMs('Hi.')).toBe(400);
    expect(estimateSpeechMs('   ')).toBe(0);
  });
});

describe('Timeline', () => {
  const make = () =>
    new Timeline({
      segments: [seg(line, 100), seg(line, 100), seg('', 500), seg(line, 100), seg(line, 100)],
      chapterStarts: [0, 3],
    });

  it('adds speech and pauses into positions and a total', () => {
    const t = make();
    expect(t.positionMs(0)).toBe(0);
    expect(t.positionMs(1, 700)).toBe(2100 + 700);
    expect(t.positionMs(3)).toBe(2100 * 2 + 500);
    expect(t.totalMs()).toBe(2100 * 4 + 500);
    expect(t.positionMs(99)).toBe(t.totalMs());
  });

  it('clamps an offset to the sentence it belongs to', () => {
    expect(make().positionMs(0, 9_999)).toBe(2100);
  });

  it('reports progress from 0 to 1', () => {
    const t = make();
    expect(t.progress(0)).toBe(0);
    expect(t.progress(5)).toBe(1);
    expect(t.progress(3)).toBeCloseTo(4700 / 8900);
  });

  it('gives time left in the chapter and the document, scaled by speed', () => {
    const t = make();
    expect(t.remaining(1, 0)).toEqual({ chapterMs: 2100 + 500, totalMs: 2100 * 3 + 500 });
    expect(t.remaining(4, 1000, 2)).toEqual({ chapterMs: 550, totalMs: 550 });
  });

  it('replaces estimates with measured lengths, keeping the pause', () => {
    const t = make();
    t.positionMs(4); // build the cache before changing an earlier sentence
    t.setMeasured(1, 3000);
    expect(t.positionMs(2)).toBe(2100 + 3100);
    expect(t.totalMs()).toBe(2100 * 3 + 3100 + 500);
  });

  it('ignores measurements for unknown sentences or invalid lengths', () => {
    const t = make();
    t.setMeasured(42, 1000);
    t.setMeasured(0, Number.NaN);
    t.setMeasured(0, -5);
    expect(t.totalMs()).toBe(8900);
  });

  it('finds the chapter of a sentence', () => {
    const t = make();
    expect([0, 2, 3, 4].map((i) => t.chapterOf(i))).toEqual([0, 0, 1, 1]);
  });

  it('handles an empty document', () => {
    const t = new Timeline({ segments: [], chapterStarts: [0] });
    expect(t.totalMs()).toBe(0);
    expect(t.progress(0)).toBe(0);
    expect(t.remaining(0, 0)).toEqual({ chapterMs: 0, totalMs: 0 });
  });
});
