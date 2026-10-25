import type { Chapter, QueueSegment, Sentence } from '@lamplight/core';
import { describe, expect, it } from 'vitest';
import { chapterStarts, toQueueFile } from '../src/player/queue';

const sentence = (block: number): Sentence => ({ block, start: 0, end: 1, kind: 'narration', pauseMs: 140 });
const chapter = (title: string, blockStart: number): Chapter => ({ title, level: 1, blockStart });
const seg = (i: number, text = `Sentence ${i}.`): QueueSegment => ({
  i,
  text,
  lang: 'en',
  voice: 'F1',
  pauseMs: 140,
  kind: 'narration',
});

describe('chapterStarts', () => {
  it('maps each chapter to its first sentence', () => {
    const sentences = [0, 0, 1, 2, 2, 3].map(sentence);
    const r = chapterStarts([chapter('One', 0), chapter('Two', 2), chapter('Three', 3)], sentences);
    expect(r).toEqual({ starts: [0, 3, 5], titles: ['One', 'Two', 'Three'] });
  });

  it('drops chapters without sentences', () => {
    const sentences = [0, 3, 3].map(sentence);
    const r = chapterStarts([chapter('One', 0), chapter('Empty', 1), chapter('Three', 2)], sentences);
    expect(r).toEqual({ starts: [0, 1], titles: ['One', 'Three'] });
  });

  it('treats a document without chapters as one chapter', () => {
    expect(chapterStarts([], [0, 1].map(sentence))).toEqual({ starts: [0], titles: [''] });
  });

  it('always starts at sentence 0 when the first chapter begins later', () => {
    const r = chapterStarts([chapter('Late', 2)], [0, 1, 2, 3].map(sentence));
    expect(r).toEqual({ starts: [0, 2], titles: ['', 'Late'] });
  });
});

describe('toQueueFile', () => {
  const sentences = [0, 1, 2].map(sentence);
  const chapters = [chapter('One', 0), chapter('Two', 2)];

  it('writes the fields Queue.kt reads', () => {
    const q = toQueueFile(
      { docId: 'd1', title: 'Book', author: 'Ada', artworkUri: null },
      chapters,
      sentences,
      [seg(0), seg(1), seg(2, '')],
    );
    expect(q).toEqual({
      docId: 'd1',
      title: 'Book',
      author: 'Ada',
      chapterStarts: [0, 2],
      chapterTitles: ['One', 'Two'],
      segments: [
        { i: 0, text: 'Sentence 0.', lang: 'en', voice: 'F1', pauseMs: 140, kind: 'narration' },
        { i: 1, text: 'Sentence 1.', lang: 'en', voice: 'F1', pauseMs: 140, kind: 'narration' },
        { i: 2, text: '', lang: 'en', voice: 'F1', pauseMs: 140, kind: 'narration' },
      ],
    });
    expect(JSON.parse(JSON.stringify(q))).toEqual(q);
  });

  it('carries the performance: pace, loudness, pitch and breath', () => {
    const performed = {
      ...seg(0),
      rate: 0.9,
      gainDb: -2.5,
      pitch: -1.5,
      breath: true as const,
      ending: 'trail' as const,
    };
    const q = toQueueFile({ docId: 'd', title: 't' }, chapters, sentences, [performed, seg(1), seg(2)]);
    expect(q.segments[0]).toMatchObject({
      rate: 0.9,
      gainDb: -2.5,
      pitch: -1.5,
      breath: true,
      ending: 'trail',
    });
  });

  it('rejects a queue with gaps, which the player would index wrongly', () => {
    expect(() => toQueueFile({ docId: 'd', title: 't' }, chapters, sentences, [seg(0), seg(2)])).toThrow(
      /contiguous/,
    );
  });

  it('drops chapters past the end of a partial queue', () => {
    const q = toQueueFile({ docId: 'd', title: 't' }, chapters, sentences, [seg(0), seg(1)]);
    expect(q.chapterStarts).toEqual([0]);
    expect(q.chapterTitles).toEqual(['One']);
  });

  it('carries the performance (pace, loudness, breath) and leaves plain lines plain', () => {
    const q = toQueueFile({ docId: 'd', title: 't' }, chapters, sentences, [
      { ...seg(0), rate: 0.9, gainDb: -6, breath: true },
      seg(1),
    ]);
    expect(q.segments[0]).toMatchObject({ rate: 0.9, gainDb: -6, breath: true });
    expect(Object.keys(q.segments[1] ?? {})).toEqual(['i', 'text', 'lang', 'voice', 'pauseMs', 'kind']);
  });
});
