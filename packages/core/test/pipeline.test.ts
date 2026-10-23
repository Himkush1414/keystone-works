import { describe, expect, it } from 'vitest';
import { defaultCleanSettings } from '../src/clean/detect';
import { assignVoices, type VoiceTraits } from '../src/cast/voices';
import { parsePlainText } from '../src/import/text';
import type { DocumentDraft } from '../src/model';
import { buildQueue, PAUSE, prepareDocument } from '../src/pipeline';

const catalog: VoiceTraits[] = [
  { id: 'F1', gender: 'f', pitch: 0.6 },
  { id: 'F2', gender: 'f', pitch: 0.8 },
  { id: 'M1', gender: 'm', pitch: 0.3 },
  { id: 'M2', gender: 'm', pitch: 0.1 },
];

const novel: DocumentDraft = {
  meta: { title: 'The Quiet Lamp', kind: 'book', language: 'en' },
  chapters: [
    { title: 'Chapter One', level: 1, blockStart: 0 },
    { title: 'Chapter Two', level: 1, blockStart: 3 },
  ],
  blocks: [
    { kind: 'heading', text: 'Chapter One', level: 1, skips: [] },
    { kind: 'paragraph', text: 'Mrs. Hale lit the lamp at 9:30 pm. The room grew warm.', skips: [] },
    { kind: 'paragraph', text: '“It is late,” said Mrs. Hale. “Go to bed.”', skips: [] },
    { kind: 'heading', text: 'Chapter Two', level: 1, skips: [] },
    { kind: 'paragraph', text: 'Morning came [1] slowly.', skips: [] },
  ],
};

describe('prepareDocument', () => {
  const doc = prepareDocument(novel);

  it('segments blocks into sentences with pauses', () => {
    const texts = doc.sentences.map((s) => novel.blocks[s.block]?.text.slice(s.start, s.end));
    expect(texts).toEqual([
      'Chapter One',
      'Mrs. Hale lit the lamp at 9:30 pm.',
      'The room grew warm.',
      '“It is late,”',
      'said Mrs. Hale.',
      '“Go to bed.”',
      'Chapter Two',
      'Morning came [1] slowly.',
    ]);
    expect(doc.sentences.map((s) => s.pauseMs)).toEqual([
      PAUSE.heading,
      PAUSE.sentence,
      PAUSE.paragraph,
      PAUSE.split,
      PAUSE.sentence,
      PAUSE.chapter,
      PAUSE.heading,
      PAUSE.paragraph,
    ]);
  });

  it('marks dialogue and attributes speakers', () => {
    expect(doc.sentences.map((s) => s.kind)).toEqual([
      'heading',
      'narration',
      'narration',
      'dialogue',
      'narration',
      'dialogue',
      'heading',
      'narration',
    ]);
    expect(doc.sentences[3]?.speaker).toBe('hale-f');
    expect(doc.sentences[5]?.speaker).toBe('hale-f');
    expect(doc.characters.map((c) => [c.id, c.gender])).toEqual([['hale-f', 'f']]);
    expect(doc.confidence[3]).toBeGreaterThan(0.9);
  });

  it('reports language, word count and Clean Read findings', () => {
    expect(doc.language).toBe('en');
    expect(doc.wordCount).toBe(29);
    expect(doc.report).toEqual([{ reason: 'citation', count: 1, examples: ['[1]'] }]);
  });

  it('detects the language when metadata is missing, and per chapter for mixed books', () => {
    const mixed = parsePlainText(
      'CHAPTER I\n\nThe lamp was still burning when she reached the last page, and the rain had softened to a whisper against the window.\n\nCHAPTER II\n\nLa lámpara seguía encendida cuando llegó a la última página, y la lluvia se había convertido en un susurro contra la ventana.',
    );
    const d = prepareDocument(mixed);
    expect(d.language).toBe('en');
    expect(d.draft.chapters.map((c) => c.language ?? null)).toEqual([null, 'es']);
  });

  it('skips Cast for documents unless asked', () => {
    const d = prepareDocument({ ...novel, meta: { ...novel.meta, kind: 'document' } });
    expect(d.sentences.every((s) => s.kind !== 'dialogue')).toBe(true);
    expect(d.characters).toEqual([]);
  });
});

describe('buildQueue', () => {
  const doc = prepareDocument(novel);
  const source = {
    blocks: doc.draft.blocks,
    chapters: doc.draft.chapters,
    sentences: doc.sentences,
    confidence: doc.confidence,
    language: doc.language,
  };
  const assignment = assignVoices(doc.characters, 'M1', catalog);

  it('produces spoken text with voices per Cast mode', () => {
    const q = buildQueue(source, {
      clean: defaultCleanSettings('book', false),
      assignment,
      castMode: 'full',
    });
    expect(q.map((s) => s.text)).toEqual([
      'Chapter One',
      'Missus Hale lit the lamp at nine thirty p m.',
      'The room grew warm.',
      '“It is late,”',
      'said Missus Hale.',
      '“Go to bed.”',
      'Chapter Two',
      'Morning came [one] slowly.', // citations aren't skipped in books by default
    ]);
    expect(q[3]?.voice).toBe(assignment.byCharacter['hale-f']);
    expect(q[3]?.voice).not.toBe('M1');
    expect(q[4]?.voice).toBe('M1');
  });

  it('applies Clean Read settings and the dictionary', () => {
    const q = buildQueue(source, {
      clean: { ...defaultCleanSettings('book', false), citation: true },
      dictionary: [{ match: 'Hale', sayAs: 'Hail', wholeWord: true, caseSensitive: true }],
      assignment,
      castMode: 'off',
      from: 4,
      to: 8,
    });
    expect(q.map((s) => [s.i, s.text, s.voice])).toEqual([
      [4, 'said Missus Hail.', 'M1'],
      [5, '“Go to bed.”', 'M1'],
      [6, 'Chapter Two', 'M1'],
      [7, 'Morning came slowly.', 'M1'],
    ]);
  });

  it('keeps fully skipped sentences as silent entries so indices stay aligned', () => {
    const draft: DocumentDraft = {
      meta: { title: 'x', kind: 'document', language: 'en' },
      chapters: [{ title: '', level: 1, blockStart: 0 }],
      blocks: [
        { kind: 'paragraph', text: 'Journal of Light 12', skips: [{ start: 0, end: 19, reason: 'header' }] },
        { kind: 'paragraph', text: 'Body.', skips: [] },
      ],
    };
    const d = prepareDocument(draft, { fromPdf: true });
    const q = buildQueue(
      { blocks: d.draft.blocks, chapters: d.draft.chapters, sentences: d.sentences, language: d.language },
      {
        clean: defaultCleanSettings('document', true),
        assignment: assignVoices([], 'F1', catalog),
        castMode: 'off',
      },
    );
    expect(q.map((s) => [s.i, s.text])).toEqual([
      [0, ''],
      [1, 'Body.'],
    ]);
  });
});
