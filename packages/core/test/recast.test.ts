import { describe, expect, it } from 'vitest';
import { parsePlainText } from '../src/import/text';
import { castInput, prepareDocument, recastSpeakers, speakerSpanOf } from '../src/pipeline';
import { CAST_BOOKS } from './fixtures/castBooks';

describe('recastSpeakers', () => {
  const book = CAST_BOOKS.find((b) => b.id === 'en-little-women-1');
  const doc = prepareDocument(parsePlainText(book?.text ?? '', 'Little Women', 'book'));
  const blocks = doc.draft.blocks;
  const name = (id?: string) => doc.characters.find((c) => c.id === id)?.name ?? id;

  it('holds a corrected line and lets the turns after it follow', () => {
    // "Don’t, Jo. It’s so boyish!" is Amy's.
    const i = doc.sentences.findIndex((s) =>
      blocks[s.block]?.text.slice(s.start, s.end).includes('so boyish'),
    );
    expect(i).toBeGreaterThan(0);
    const sentence = doc.sentences[i];
    const pin = sentence && speakerSpanOf(blocks, sentence, 'en');
    expect(pin).toBeDefined();
    const before = recastSpeakers(blocks, doc.sentences, 'en', []);
    const after = recastSpeakers(blocks, doc.sentences, 'en', pin ? [{ ...pin, speaker: 'Amy' }] : []);
    expect(name(after.speakers[i])).toBe('Amy');
    expect(after.confidence[i]).toBe(1);
    // Lines the text tags keep their speakers.
    doc.sentences.forEach((_, k) => {
      if (k !== i && (before.confidence[k] ?? 0) >= 0.9) expect(after.speakers[k]).toBe(before.speakers[k]);
    });
  });
});

describe('Cast for stories that are not books', () => {
  it('finds speakers in a short document that is mostly dialogue, and leaves plain documents alone', () => {
    const story = CAST_BOOKS.find((b) => b.id === 'hi-idgah')?.text ?? '';
    const doc = prepareDocument({
      ...parsePlainText(story, 'ईदगाह', 'document'),
      meta: { title: 'ईदगाह', kind: 'document', language: 'hi' },
    });
    expect(doc.characters.length).toBeGreaterThan(3);
    expect(doc.sentences.some((s) => s.kind === 'dialogue' && s.speaker)).toBe(true);
    const memo = prepareDocument(
      parsePlainText('The meeting is at nine.\n\nBring the report.\n\nThanks.', 'Memo', 'document'),
    );
    expect(memo.sentences.every((s) => s.kind === 'narration')).toBe(true);
  });
});

describe('castInput', () => {
  const para = (text: string) => ({ kind: 'paragraph' as const, text, skips: [] });

  it('leaves out a bracketed illustration caption, even one split over several paragraphs', () => {
    const blocks = [
      para('“Do not you want to know who has taken it?” cried his wife, impatiently.'),
      para('[Illustration:'),
      para('“He came down to see the place”'),
      para('[_Copyright 1894 by George Allen._]]'),
      para('“You want to tell me, and I have no objection to hearing it.”'),
    ];
    expect(castInput(blocks)).toEqual([blocks[0]?.text, '', '', '', blocks[4]?.text]);
  });

  it('gives no speaker to a quotation inside a caption', () => {
    const text = [
      '“My dear Mr. Bennet,” said his lady to him one day, “have you heard that Netherfield Park is let at last?”',
      'Mr. Bennet replied that he had not.',
      '“But it is,” returned she.',
      '[Illustration: “He came down to see the place”]',
      '“What is his name?” said Mr. Bennet.',
    ].join('\n\n');
    const doc = prepareDocument(parsePlainText(text, 'Pride and Prejudice', 'book'));
    const caption = doc.draft.blocks.findIndex((b) => b.text.startsWith('[Illustration'));
    expect(caption).toBeGreaterThan(0);
    const inCaption = doc.sentences.filter((s) => s.block === caption);
    expect(inCaption.length).toBeGreaterThan(0);
    expect(inCaption.every((s) => !s.speaker)).toBe(true);
    expect(doc.sentences.some((s) => s.speaker)).toBe(true);
  });

  it('stops treating text as a caption when the bracket never closes', () => {
    const blocks = [
      para('[Illustration: a caption that never closes'),
      ...Array.from({ length: 8 }, (_, i) => para(`“Line ${i},” said Jo.`)),
    ];
    const out = castInput(blocks);
    expect(out.slice(0, 6).every((t) => t === '')).toBe(true);
    expect(out[8]).toBe(blocks[8]?.text);
  });

  it('reads headings and captions as nothing', () => {
    expect(
      castInput([
        { kind: 'heading', text: '“Chapter” one', level: 1, skips: [] },
        { kind: 'caption', text: '“Hello,” said Jo.', skips: [] },
      ]),
    ).toEqual(['', '']);
  });
});
