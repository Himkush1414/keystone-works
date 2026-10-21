import { parsePlainText, prepareDocument } from '@lamplight/core';
import { describe, expect, it } from 'vitest';
import { createDocument, markOpened, saveContent } from '../src/data/library';
import { createLibraryStore, summarize } from '../src/state/library';
import { testDb } from './nodeDb';

function addDoc(db: ReturnType<typeof testDb>, title: string, kind: 'book' | 'article' = 'book') {
  const id = createDocument(db, { kind, title, source: 'file' });
  saveContent(db, id, prepareDocument(parsePlainText(`${title} begins here. It goes on.`, title, kind)));
  return id;
}

describe('summarize', () => {
  it('groups import results for the toast', () => {
    expect(
      summarize([
        { status: 'ready', id: 'a' },
        { status: 'duplicate', id: 'b' },
        { status: 'failed', id: null, code: 'drm' },
        { status: 'ready', id: 'c' },
      ]),
    ).toEqual({ added: ['a', 'c'], duplicates: ['b'], failed: [{ id: null, code: 'drm' }] });
  });
});

describe('library store', () => {
  it('lists the library and the item to continue', () => {
    const db = testDb();
    const book = addDoc(db, 'Alpha');
    addDoc(db, 'Beta', 'article');
    markOpened(db, book, 5_000);
    const store = createLibraryStore(db);
    store.getState().refresh();
    expect(
      store
        .getState()
        .items.map((i) => i.title)
        .sort(),
    ).toEqual(['Alpha', 'Beta']);
    expect(store.getState().continueWith?.id).toBe(book);
  });

  it('changes shelf and sort, then refreshes', () => {
    const db = testDb();
    addDoc(db, 'Alpha');
    addDoc(db, 'Beta', 'article');
    const store = createLibraryStore(db);
    store.getState().setView({ shelf: 'articles' });
    expect(store.getState().items.map((i) => i.title)).toEqual(['Beta']);
    store.getState().setView({ shelf: 'all', sort: 'title' });
    expect(store.getState().items.map((i) => i.title)).toEqual(['Alpha', 'Beta']);
  });

  it('shows importing while an import runs and refreshes when it ends', async () => {
    const db = testDb();
    const store = createLibraryStore(db);
    const during: boolean[] = [];
    const summary = await store.getState().runImport(() => {
      during.push(store.getState().importing);
      const id = addDoc(db, 'Gamma');
      return Promise.resolve([{ status: 'ready', id }]);
    });
    expect(during).toEqual([true]);
    expect(store.getState().importing).toBe(false);
    expect(summary?.added).toHaveLength(1);
    expect(store.getState().items.map((i) => i.title)).toEqual(['Gamma']);
  });

  it('returns null when the user cancels, and still clears the importing flag after an error', async () => {
    const store = createLibraryStore(testDb());
    expect(await store.getState().runImport(() => Promise.resolve(null))).toBeNull();
    await expect(
      store.getState().runImport(() => Promise.reject(new Error('picker crashed'))),
    ).rejects.toThrow();
    expect(store.getState().importing).toBe(false);
  });
});
