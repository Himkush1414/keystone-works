import { parsePlainText, prepareDocument } from '@lamplight/core';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data/content';
import { createDocument, saveContent } from '../src/data/library';
import { testDb } from './nodeDb';

describe('emphasis in the library', () => {
  it('is stored with the text and comes back for the reader', () => {
    const db = testDb();
    const id = createDocument(db, { kind: 'book', title: 'Pride', source: 'file' });
    saveContent(
      db,
      id,
      prepareDocument(parsePlainText('“But he _may_ fall in love with one of them.”', 'Pride', 'book')),
    );
    const block = loadContent(db, id).blocks[0];
    expect(block?.text).toBe('“But he may fall in love with one of them.”');
    expect(block?.emphasis).toEqual([[8, 11]]);
  });

  it('leaves blocks without emphasis as they were', () => {
    const db = testDb();
    const id = createDocument(db, { kind: 'book', title: 'Plain', source: 'file' });
    saveContent(db, id, prepareDocument(parsePlainText('Nothing stands out here.', 'Plain', 'book')));
    expect(loadContent(db, id).blocks[0]).not.toHaveProperty('emphasis');
  });
});
