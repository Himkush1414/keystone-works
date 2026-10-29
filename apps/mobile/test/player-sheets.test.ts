import { describe, expect, it } from 'vitest';
import { bookmarkEntries, contentsEntries, sleepStatus } from '../src/player/sheets';

describe('sleepStatus', () => {
  it('is null when no timer is set', () => {
    expect(sleepStatus({ sleepAt: null, sleepAtIndex: null }, 0, 'en')).toBeNull();
  });

  it('says how long is left, or that it ends with the chapter', () => {
    expect(sleepStatus({ sleepAt: 12 * 60_000, sleepAtIndex: null }, 0, 'en')).toBe('Ends in 12 min');
    expect(sleepStatus({ sleepAt: null, sleepAtIndex: 40 }, 0, 'en')).toBe('Ends with this chapter');
    expect(sleepStatus({ sleepAt: 1_000, sleepAtIndex: null }, 5_000, 'en')).toBe(
      'Ends in less than a minute',
    );
  });
});

describe('contentsEntries', () => {
  const queue = { title: 'Book', chapterStarts: [0, 10, 25], chapterTitles: ['', 'One', 'Two'] };

  it('lists chapters with where they start, marking the one being heard', () => {
    expect(contentsEntries(queue, 12)).toEqual([
      { title: 'Book', start: 0, current: false },
      { title: 'One', start: 10, current: true },
      { title: 'Two', start: 25, current: false },
    ]);
  });

  it('marks the last chapter at the end of the book', () => {
    expect(contentsEntries(queue, 99).map((e) => e.current)).toEqual([false, false, true]);
  });
});

describe('bookmarkEntries', () => {
  const blocks = [
    { text: 'Call me Ishmael. Some years ago,\n  never mind how long.' },
    { text: 'x'.repeat(200) },
  ];
  const sentences = [
    { block: 0, start: 0, end: 16 },
    { block: 0, start: 17, end: 55 },
    { block: 1, start: 0, end: 200 },
  ];

  it('lists bookmarks in reading order, named by their words', () => {
    const marks = [
      { id: 'b', sentenceOrd: 1, label: null },
      { id: 'a', sentenceOrd: 0, label: null },
    ];
    expect(bookmarkEntries(marks, blocks, sentences)).toEqual([
      { id: 'a', start: 0, text: 'Call me Ishmael.' },
      { id: 'b', start: 1, text: 'Some years ago, never mind how long.' },
    ]);
  });

  it('prefers a label, shortens long sentences and drops ones past the end', () => {
    const marks = [
      { id: 'l', sentenceOrd: 0, label: 'Opening' },
      { id: 'long', sentenceOrd: 2, label: null },
      { id: 'gone', sentenceOrd: 9, label: null },
    ];
    const entries = bookmarkEntries(marks, blocks, sentences);
    expect(entries.map((e) => e.id)).toEqual(['l', 'long']);
    expect(entries.map((e) => e.text)).toEqual(['Opening', `${'x'.repeat(90)}…`]);
  });
});
