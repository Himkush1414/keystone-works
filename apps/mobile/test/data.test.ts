import { parsePlainText, prepareDocument, type DocumentDraft, CAST_VERSION } from '@lamplight/core';
import { describe, expect, it } from 'vitest';
import { loadContent, mergeCharacters, setCharacterVoice } from '../src/data/content';
import { newId } from '../src/data/ids';
import {
  continueItem,
  createDocument,
  findBySha,
  ftsQuery,
  getItem,
  listItems,
  markOpened,
  purgeDeleted,
  restore,
  saveContent,
  search,
  setFinished,
  softDelete,
  updateDetails,
  updateSettings,
} from '../src/data/library';
import { migrate, migrations } from '../src/data/migrations';
import {
  addBookmark,
  addDictionaryEntry,
  addHighlight,
  addToCollection,
  collectionDocumentIds,
  createCollection,
  getPosition,
  getSetting,
  listBookmarks,
  listCollections,
  listenedSince,
  listHighlights,
  rulesFor,
  savePosition,
  setSetting,
  updateDictionaryEntry,
} from '../src/data/userdata';
import { testDb } from './nodeDb';

const novel: DocumentDraft = {
  meta: { title: 'The Quiet Lamp', author: 'Ada Reed', kind: 'book', language: 'en' },
  chapters: [
    { title: 'One', level: 1, blockStart: 0 },
    { title: 'Two', level: 1, blockStart: 3 },
  ],
  blocks: [
    { kind: 'heading', text: 'One', level: 1, skips: [] },
    { kind: 'paragraph', text: 'Mrs. Hale lit the lamp. The café was warm.', skips: [] },
    { kind: 'paragraph', text: '“It is late,” said Mrs. Hale.', skips: [] },
    { kind: 'heading', text: 'Two', level: 1, skips: [] },
    { kind: 'paragraph', text: 'Morning came [1] slowly over the harbour.', skips: [] },
  ],
};

function seed(db = testDb()) {
  const id = createDocument(db, { kind: 'book', title: 'novel.epub', source: 'file', sha256: 'abc' }, 1000);
  saveContent(db, id, prepareDocument(novel));
  return { db, id };
}

describe('migrations', () => {
  it('migrates a fresh database to the latest version and is idempotent', () => {
    const db = testDb();
    expect(migrate(db)).toBe(migrations[migrations.length - 1]?.id);
    expect(migrate(db)).toBe(migrations[migrations.length - 1]?.id);
  });

  it('refuses a database from a newer app version', () => {
    const db = testDb();
    db.run("UPDATE schema_meta SET value = '999' WHERE key = 'version'");
    expect(() => migrate(db)).toThrow(/newer/);
  });
});

describe('ids', () => {
  it('are unique and sort by time', () => {
    const a = newId(1000);
    const b = newId(2000);
    expect(a < b).toBe(true);
    expect(new Set(Array.from({ length: 1000 }, () => newId())).size).toBe(1000);
  });
});

describe('documents', () => {
  it('saves content atomically and keeps sentence and chapter invariants', () => {
    const { db, id } = seed();
    const item = getItem(db, id);
    expect(item).toMatchObject({
      title: 'The Quiet Lamp',
      author: 'Ada Reed',
      status: 'ready',
      language: 'en',
    });
    const c = loadContent(db, id);
    expect(c.blocks).toHaveLength(5);
    expect(item?.sentenceCount).toBe(c.sentences.length);
    c.sentences.forEach((s) => expect(s.block).toBeLessThan(c.blocks.length));
    expect(c.chapters.map((ch) => ch.firstSentence)).toEqual([0, c.sentences.findIndex((s) => s.block >= 3)]);
    expect(c.characters.map((ch) => ch.id)).toEqual(['hale-f']);
    expect(c.blocks[4]?.skips).toEqual([{ start: 13, end: 16, reason: 'citation' }]);
  });

  it('re-saving replaces content instead of duplicating it', () => {
    const { db, id } = seed();
    saveContent(db, id, prepareDocument(novel));
    expect(loadContent(db, id).blocks).toHaveLength(5);
    expect(search(db, 'harbour').body).toHaveLength(1);
  });

  it('takes the kind the importer decided, so a long text file shelves as a book', () => {
    const db = testDb();
    const id = createDocument(db, { kind: 'document', title: 'big.txt', source: 'file' });
    const text = Array.from({ length: 401 }, (_, k) => `Paragraph ${k} of a long story.`).join('\n\n');
    saveContent(db, id, prepareDocument(parsePlainText(text, 'Big')));
    expect(getItem(db, id)?.kind).toBe('book');
    expect(listItems(db, 'books').map((i) => i.id)).toEqual([id]);
  });

  it('finds duplicates by hash', () => {
    const { db, id } = seed();
    expect(findBySha(db, 'abc')?.id).toBe(id);
    expect(() => createDocument(db, { kind: 'book', title: 'x', source: 'file', sha256: 'abc' })).toThrow();
  });

  it('lists by shelf, status and sort order', () => {
    const { db, id } = seed();
    const art = createDocument(db, { kind: 'article', title: 'Zebra Notes', source: 'url' }, 2000);
    saveContent(db, art, prepareDocument(parsePlainText('Zebra article body.', 'Zebra Notes', 'article')));
    expect(listItems(db, 'books').map((i) => i.id)).toEqual([id]);
    expect(listItems(db, 'articles').map((i) => i.id)).toEqual([art]);
    expect(listItems(db, 'all', 'title').map((i) => i.title)).toEqual(['The Quiet Lamp', 'Zebra Notes']);
    savePosition(db, id, { sentenceOrd: 2, offsetMs: 100, progress: 0.4 });
    expect(listItems(db, 'all', 'progress')[0]?.id).toBe(id);
    expect(listItems(db, 'all', 'recent', 'inProgress').map((i) => i.id)).toEqual([id]);
    expect(listItems(db, 'all', 'recent', 'new').map((i) => i.id)).toEqual([art]);
    setFinished(db, id, true);
    expect(listItems(db, 'all', 'recent', 'finished').map((i) => i.id)).toEqual([id]);
  });

  it('offers the most recently opened unfinished item to continue', () => {
    const { db, id } = seed();
    expect(continueItem(db)).toBeUndefined();
    markOpened(db, id, 5000);
    expect(continueItem(db)?.id).toBe(id);
    setFinished(db, id, true);
    expect(continueItem(db)).toBeUndefined();
  });

  it('updates details and merges settings', () => {
    const { db, id } = seed();
    updateDetails(db, id, { title: '  Lamp  ', author: '' });
    expect(getItem(db, id)).toMatchObject({ title: 'Lamp', author: null });
    updateSettings(db, id, { voice: 'F2' });
    expect(updateSettings(db, id, { castMode: 'full' })).toEqual({
      voice: 'F2',
      castMode: 'full',
      castVersion: CAST_VERSION, // saving the text records which Cast attributed it
    });
  });

  it('soft-deletes with undo, then purges with cascades', () => {
    const { db, id } = seed();
    addBookmark(db, id, 1);
    softDelete(db, id, 10_000);
    expect(listItems(db)).toEqual([]);
    expect(search(db, 'lamp').titles).toEqual([]);
    restore(db, id);
    expect(listItems(db)).toHaveLength(1);
    softDelete(db, id, 10_000);
    expect(purgeDeleted(db, 20_000)).toEqual([id]);
    for (const t of ['blocks', 'sentences', 'chapters', 'characters', 'bookmarks']) {
      expect(db.get<{ n: number }>(`SELECT count(*) AS n FROM ${t}`)?.n).toBe(0);
    }
    expect(db.get<{ n: number }>('SELECT count(*) AS n FROM blocks_fts')?.n).toBe(0);
  });
});

describe('search', () => {
  it('builds safe prefix queries', () => {
    expect(ftsQuery('  The "quiet" LAMP!! ')).toBe('"the"* "quiet"* "lamp"*');
    expect(ftsQuery('***')).toBeNull();
  });

  it('finds titles, authors and body text, ignoring accents', () => {
    const { db, id } = seed();
    expect(search(db, 'quiet').titles.map((h) => h.documentId)).toEqual([id]);
    expect(search(db, 'reed').titles).toHaveLength(1);
    const body = search(db, 'cafe');
    expect(body.body[0]).toMatchObject({ documentId: id, blockOrd: 1 });
    expect(body.body[0]?.snippet).toContain('café');
    expect(search(db, 'harb').body).toHaveLength(1);
    expect(search(db, 'nothing-here').body).toEqual([]);
  });
});

describe('positions and listening time', () => {
  it('upserts positions and accumulates listening time per item and day', () => {
    const { db, id } = seed();
    const day = new Date(2026, 9, 20, 12).getTime();
    savePosition(db, id, { sentenceOrd: 1, offsetMs: 250.6, progress: 0.2, listenedDeltaMs: 60_000 }, day);
    savePosition(db, id, { sentenceOrd: 3, offsetMs: 0, progress: 1.4, listenedDeltaMs: 30_000 }, day + 1000);
    expect(getPosition(db, id)).toEqual({
      sentenceOrd: 3,
      offsetMs: 0,
      progress: 1,
      listenedMs: 90_000,
      updatedAt: day + 1000,
    });
    expect(listenedSince(db, 7, day + 2000)).toBe(90_000);
    expect(listenedSince(db, 1, day + 3 * 86_400_000)).toBe(0);
  });
});

describe('annotations, collections and settings', () => {
  it('stores bookmarks and highlights in reading order', () => {
    const { db, id } = seed();
    addBookmark(db, id, 3, 'here');
    addBookmark(db, id, 1);
    expect(listBookmarks(db, id).map((b) => [b.sentenceOrd, b.label])).toEqual([
      [1, null],
      [3, 'here'],
    ]);
    addHighlight(db, id, { blockOrd: 2, start: 0, end: 5, note: ' warm ' });
    addHighlight(db, id, { blockOrd: 1, start: 4, end: 8 });
    expect(listHighlights(db, id).map((h) => [h.blockOrd, h.note])).toEqual([
      [1, null],
      [2, 'warm'],
    ]);
    expect(() => addHighlight(db, id, { blockOrd: 1, start: 5, end: 5 })).toThrow();
  });

  it('manages collections without duplicates and hides deleted items', () => {
    const { db, id } = seed();
    const c = createCollection(db, ' Night reading ');
    addToCollection(db, c, id);
    addToCollection(db, c, id);
    expect(listCollections(db)).toEqual([{ id: c, name: 'Night reading', count: 1 }]);
    softDelete(db, id);
    expect(collectionDocumentIds(db, c)).toEqual([]);
    expect(listCollections(db)[0]?.count).toBe(0);
  });

  it('orders dictionary rules document-first and respects enabled flags', () => {
    const { db, id } = seed();
    addDictionaryEntry(db, { match: 'Hale', sayAs: 'Hail' });
    const local = addDictionaryEntry(db, { match: 'Hale', sayAs: 'Hah-lay', documentId: id });
    expect(rulesFor(db, id).map((r) => r.sayAs)).toEqual(['Hah-lay', 'Hail']);
    updateDictionaryEntry(db, local, { enabled: false });
    expect(rulesFor(db, id).map((r) => r.sayAs)).toEqual(['Hail']);
    expect(() => addDictionaryEntry(db, { match: ' ', sayAs: 'x' })).toThrow();
  });

  it('stores typed settings with fallbacks', () => {
    const db = testDb();
    expect(getSetting(db, 'speed', 1)).toBe(1);
    setSetting(db, 'speed', 1.25);
    setSetting(db, 'speed', 1.5);
    expect(getSetting(db, 'speed', 1)).toBe(1.5);
    setSetting(db, 'voices', { en: 'F1' });
    expect(getSetting(db, 'voices', {})).toEqual({ en: 'F1' });
  });

  it('assigns and merges Cast characters', () => {
    const db = testDb();
    const id = createDocument(db, { kind: 'book', title: 'x', source: 'file' });
    const draft: DocumentDraft = {
      meta: { title: 'x', kind: 'book', language: 'en' },
      chapters: [{ title: '', level: 1, blockStart: 0 }],
      blocks: [
        { kind: 'paragraph', text: '“Hello,” said Elizabeth.', skips: [] },
        { kind: 'paragraph', text: '“Hi,” said Lizzy.', skips: [] },
      ],
    };
    saveContent(db, id, prepareDocument(draft));
    setCharacterVoice(db, id, 'elizabeth', 'F2');
    mergeCharacters(db, id, 'lizzy', 'elizabeth');
    const c = loadContent(db, id);
    expect(c.characters).toEqual([
      {
        id: 'elizabeth',
        name: 'Elizabeth',
        aliases: ['Elizabeth', 'Lizzy'],
        gender: 'f', // from her given name
        lineCount: 2,
        voiceId: 'F2',
        age: null,
        temperament: null,
        autoVoiceId: null,
      },
    ]);
    expect(c.sentences.filter((s) => s.speaker === 'elizabeth')).toHaveLength(2);
  });
});
