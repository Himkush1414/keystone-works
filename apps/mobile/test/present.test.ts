import { coverPalettes } from '@lamplight/tokens';
import { describe, expect, it } from 'vitest';
import type { LibraryItem } from '../src/data/library';
import { estimatedListeningMs, generatedCover, itemState, rowMeta } from '../src/library/present';

const item = (patch: Partial<LibraryItem> = {}): LibraryItem => ({
  id: 'd1',
  kind: 'book',
  title: 'The Quiet Lamp',
  author: 'Ada Lovelace',
  source: 'file',
  sourceUri: null,
  siteName: null,
  language: 'en',
  coverPath: null,
  status: 'ready',
  errorCode: null,
  wordCount: 16_200,
  sentenceCount: 900,
  settings: {},
  addedAt: 0,
  openedAt: null,
  finishedAt: null,
  progress: 0,
  sentenceOrd: 0,
  listenedMs: 0,
  ...patch,
});

describe('generatedCover', () => {
  it('always gives the same title the same palette, ignoring case and spacing', () => {
    const a = generatedCover('The Quiet Lamp');
    expect(generatedCover('  the quiet lamp ')).toEqual(a);
    expect(coverPalettes.map((p) => p[0])).toContain(a.background);
  });

  it('uses several palettes across a library', () => {
    const titles = ['Emma', 'Persuasion', 'Middlemarch', 'Dracula', 'Walden', 'Ulysses', 'Beowulf', 'Kim'];
    expect(new Set(titles.map((t) => generatedCover(t).background)).size).toBeGreaterThan(3);
  });

  it('sets long titles and long words smaller so they fit', () => {
    expect(generatedCover('Emma').titleScale).toBeGreaterThan(
      generatedCover('A Very Long Title For A Small Cover').titleScale,
    );
    expect(generatedCover('Supercalifragilistic').titleScale).toBe(0.11);
  });
});

describe('estimatedListeningMs', () => {
  it('reads about 2.7 words a second at 1× and scales with speed', () => {
    expect(estimatedListeningMs(2_700)).toBe(1_000_000);
    expect(estimatedListeningMs(2_700, 2)).toBe(500_000);
    expect(estimatedListeningMs(2_700, 0)).toBe(1_000_000);
  });
});

describe('row state and meta line', () => {
  it('derives the state from status, progress and finished', () => {
    expect(itemState(item())).toBe('new');
    expect(itemState(item({ progress: 0.3 }))).toBe('inProgress');
    expect(itemState(item({ progress: 0.3, finishedAt: 5 }))).toBe('finished');
    expect(itemState(item({ status: 'importing' }))).toBe('importing');
    expect(itemState(item({ status: 'failed' }))).toBe('failed');
  });

  it('shows the author and where the listener stands', () => {
    expect(rowMeta(item(), 'en')).toBe('Ada Lovelace · New');
    // 16,200 words ≈ 100 minutes; half listened leaves 50.
    expect(rowMeta(item({ progress: 0.5 }), 'en')).toBe('Ada Lovelace · 50 min left');
    expect(rowMeta(item({ progress: 0.5 }), 'en', 2)).toBe('Ada Lovelace · 25 min left');
    expect(rowMeta(item({ author: null, status: 'importing' }), 'en')).toBe('Preparing…');
  });

  it('is translated', () => {
    expect(rowMeta(item({ progress: 0.5 }), 'de')).toMatch(/50/);
    expect(rowMeta(item({ progress: 0.5 }), 'de')).not.toBe(rowMeta(item({ progress: 0.5 }), 'en'));
  });
});
