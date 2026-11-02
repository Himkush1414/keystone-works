import { describe, expect, it } from 'vitest';
import type { QueueFile } from '../modules/lamplight-engine/src/types';
import { exportEta, exportPlan, playlist, safeName } from '../src/player/export';

const queue = (
  texts: string[],
  starts: number[],
  titles: string[],
  title = 'Pride and Prejudice',
): QueueFile => ({
  docId: 'd1',
  title,
  author: 'Jane Austen',
  chapterStarts: starts,
  chapterTitles: titles,
  segments: texts.map((text, i) => ({ i, text, lang: 'en', voice: 'F1', pauseMs: 400, kind: 'narration' })),
});

describe('safeName', () => {
  it('keeps titles readable and file-system safe', () => {
    expect(safeName('Chapter 1: "The Ball"?')).toBe('Chapter 1 The Ball');
    expect(safeName('a/b\\c|d*e')).toBe('a b c d e');
    expect(safeName('Ends with dots...')).toBe('Ends with dots');
    expect(safeName('मानसरोवर १/ईदगाह')).toBe('मानसरोवर १ ईदगाह');
    expect(safeName('   ', 'Book')).toBe('Book');
    expect(Array.from(safeName('x'.repeat(200)))).toHaveLength(80);
  });
});

describe('exportPlan', () => {
  it('writes one numbered file per chapter, in reading order', () => {
    const q = queue(
      ['Chapter 1', 'It is a truth.', 'Chapter 2', 'Mr. Bingley.', 'More.'],
      [0, 2],
      ['Chapter 1', 'Chapter 2'],
    );
    const plan = exportPlan(q);
    expect(plan.folder).toBe('Pride and Prejudice');
    expect(plan.playlist).toBe('Pride and Prejudice.m3u8');
    expect(plan.tracks).toEqual([
      { n: 1, title: 'Chapter 1', file: '01 Chapter 1.m4a', from: 0, to: 2 },
      { n: 2, title: 'Chapter 2', file: '02 Chapter 2.m4a', from: 2, to: 5 },
    ]);
    expect(plan.sentences).toBe(5);
  });

  it('names untitled front matter after the book and skips chapters with nothing to say', () => {
    const q = queue(['Preface text.', '', ' ', 'Body.'], [0, 1, 3], ['', 'Blank', 'Body']);
    expect(exportPlan(q).tracks.map((t) => t.file)).toEqual(['01 Pride and Prejudice.m4a', '02 Body.m4a']);
  });

  it('exports one chapter on its own', () => {
    const q = queue(['One.', 'Two.', 'Three.'], [0, 1, 2], ['A', 'B', 'C']);
    expect(exportPlan(q, { chapter: 1 }).tracks).toEqual([
      { n: 1, title: 'B', file: '01 B.m4a', from: 1, to: 2 },
    ]);
  });

  it('pads numbers to sort in long books', () => {
    const texts = Array.from({ length: 120 }, (_, i) => `Sentence ${i}.`);
    const starts = texts.map((_, i) => i);
    const plan = exportPlan(
      queue(
        texts,
        starts,
        starts.map((i) => `C${i}`),
      ),
    );
    expect(plan.tracks[0]?.file).toBe('001 C0.m4a');
    expect(plan.tracks[119]?.file).toBe('120 C119.m4a');
  });
});

describe('playlist', () => {
  it('lists each file with its length and title', () => {
    const plan = exportPlan(queue(['One.', 'Two.'], [0, 1], ['Chapter 1', 'Chapter 2']));
    expect(playlist(plan, { title: 'Pride and Prejudice', author: 'Jane Austen' }, [61_400, 125_000])).toBe(
      [
        '#EXTM3U',
        '#PLAYLIST:Pride and Prejudice',
        '#EXTINF:61,Jane Austen - Chapter 1',
        '01 Chapter 1.m4a',
        '#EXTINF:125,Jane Austen - Chapter 2',
        '02 Chapter 2.m4a',
        '',
      ].join('\n'),
    );
  });
});

describe('exportEta', () => {
  it('waits for a few sentences, then projects the pace', () => {
    expect(exportEta(1, 100, 5_000)).toBeNull();
    expect(exportEta(10, 100, 20_000)).toBe(180_000);
    expect(exportEta(100, 100, 20_000)).toBe(0);
  });
});
