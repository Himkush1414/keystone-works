import { coverPalettes } from '@lamplight/tokens';
import { describe, expect, it } from 'vitest';
import type { LibraryItem } from '../src/data/library';
import { IMPORT_VERSION } from '../src/data/library';
import {
  coverTitleSize,
  estimatedListeningMs,
  generatedCover,
  itemState,
  monogram,
  needsReimport,
  rowMeta,
} from '../src/library/present';

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
  loading: null,
  importVersion: IMPORT_VERSION,
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
});

describe('coverTitleSize', () => {
  it('shrinks the type until the longest word fits on one line', () => {
    const inner = 80;
    for (const title of ['Middlemarch', 'Persuasion', 'Wuthering Heights', 'Sense and Sensibility']) {
      const longest = Math.max(...title.split(' ').map((w) => w.length));
      expect(coverTitleSize(title, inner) * 0.7 * longest).toBeLessThanOrEqual(inner);
    }
  });

  it('never goes below 6 dp, even when a very long word then has to break', () => {
    expect(coverTitleSize('Supercalifragilisticexpialidocious', 80)).toBe(6);
  });

  it('sets long titles smaller than short ones', () => {
    expect(coverTitleSize('Emma', 80)).toBeGreaterThan(
      coverTitleSize('A Very Long Title For A Small Cover', 80),
    );
  });
});

describe('monogram', () => {
  it('takes the first letter, skipping a leading article', () => {
    expect(monogram('The Quiet Lamp')).toBe('Q');
    expect(monogram('an evening')).toBe('E');
    expect(monogram('Die Verwandlung')).toBe('V');
    expect(monogram('“Quoted” title')).toBe('Q');
    expect(monogram('')).toBe('·');
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

  it('says how far a long PDF has been read, and that a scanned one has no text', () => {
    expect(rowMeta(item({ loading: { pages: 12, of: 873 } }), 'en')).toBe(
      'Ada Lovelace · New · Reading pages 12 of 873',
    );
    expect(rowMeta(item({ author: null, status: 'failed', errorCode: 'scanned' }), 'en')).toBe(
      'Scanned images, no text to read',
    );
  });

  it('is translated', () => {
    expect(rowMeta(item({ progress: 0.5 }), 'de')).toMatch(/50/);
    expect(rowMeta(item({ progress: 0.5 }), 'de')).not.toBe(rowMeta(item({ progress: 0.5 }), 'en'));
  });
});

describe('needsReimport', () => {
  const cut = [
    'इ',
    'प्र मचंद रमज़ान के पूरे तीस रोज़ के बाद आज',
    'मोह',
    'मोह',
    'हा',
    'सम्मी--- तीन ही पैसे',
    'महमूद--हम',
    'दूकानदार ने',
    'नूरे',
  ];
  const blocks = (texts: string[]) => texts.map((text) => ({ kind: 'paragraph', text }));
  const whole = Array.from(
    { length: 10 },
    () => 'रमज़ान के पूरे तीस रोज़ के बाद आज ईद आई है। कितना मनोहर, कितना सुहावना प्रभात है।',
  );

  it('flags text an older importer cut short', () => {
    expect(needsReimport(item({ importVersion: 0 }), blocks(cut))).toBe(true);
  });

  it('leaves whole text, current imports, pasted text and short documents alone', () => {
    expect(needsReimport(item({ importVersion: 0 }), blocks(whole))).toBe(false);
    expect(needsReimport(item({ importVersion: IMPORT_VERSION }), blocks(cut))).toBe(false);
    expect(needsReimport(item({ importVersion: 0, source: 'paste' }), blocks(cut))).toBe(false);
    expect(needsReimport(item({ importVersion: 0 }), blocks(cut.slice(0, 5)))).toBe(false);
  });
});
