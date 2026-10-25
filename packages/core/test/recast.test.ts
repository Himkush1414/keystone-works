import { describe, expect, it } from 'vitest';
import { parsePlainText } from '../src/import/text';
import { prepareDocument, recastSpeakers, speakerSpanOf } from '../src/pipeline';
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
