import { describe, expect, it } from 'vitest';
import { CAST_BOOKS } from '../../../packages/core/test/fixtures/castBooks';
import { parsePlainText, prepareDocument } from '@lamplight/core';
import { correctSpeaker, listCharacters, loadContent, setCharacterVoice } from '../src/data/content';
import { createDocument, getItem, saveContent } from '../src/data/library';
import { testDb } from './nodeDb';

describe('correctSpeaker', () => {
  const setup = () => {
    const db = testDb();
    const id = createDocument(db, { kind: 'book', title: 'Little Women', source: 'file' });
    const text = CAST_BOOKS.find((b) => b.id === 'en-little-women-1')?.text ?? '';
    saveContent(db, id, prepareDocument(parsePlainText(text, 'Little Women', 'book')));
    const content = loadContent(db, id);
    const ord = content.sentences.findIndex((s) =>
      content.blocks[s.block]?.text.slice(s.start, s.end).includes('so boyish'),
    );
    return { db, id, ord };
  };
  const amyOf = (db: ReturnType<typeof testDb>, id: string) =>
    listCharacters(db, id).find((c) => c.name === 'Amy')?.id ?? '';

  it('gives the line to the chosen character and keeps the correction with the book', () => {
    const { db, id, ord } = setup();
    const amy = amyOf(db, id);
    expect(correctSpeaker(db, id, ord, amy)).toBe(true);
    expect(loadContent(db, id).sentences[ord]?.speaker).toBe(amy);
    expect(getItem(db, id)?.settings.speakerFixes).toHaveLength(1);
    // Correcting the same line again replaces the fix instead of adding another.
    correctSpeaker(db, id, ord, null);
    expect(loadContent(db, id).sentences[ord]?.speaker).toBeUndefined();
    expect(getItem(db, id)?.settings.speakerFixes).toEqual([expect.objectContaining({ speaker: null })]);
  });

  it('keeps the voice a listener chose for a character', () => {
    const { db, id, ord } = setup();
    const amy = amyOf(db, id);
    setCharacterVoice(db, id, amy, 'F4');
    correctSpeaker(db, id, ord, amy);
    expect(listCharacters(db, id).find((c) => c.id === amy)?.voiceId).toBe('F4');
  });

  it('refuses a line outside any quotation, and an unknown character', () => {
    const { db, id, ord } = setup();
    const narration = loadContent(db, id).sentences.findIndex((s) => s.kind === 'narration');
    expect(correctSpeaker(db, id, narration, amyOf(db, id))).toBe(false);
    expect(correctSpeaker(db, id, ord, 'nobody-by-that-id')).toBe(false);
  });
});
