import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { makeEpub } from '../../../packages/core/test/fixtures/epub';
import { loadContent } from '../src/data/content';
import { getItem, IMPORT_VERSION, listItems } from '../src/data/library';
import { importFile, type ImportDeps } from '../src/import/run';
import { failingPdfReader, fakePdfReader } from './fakePdf';
import { testDb } from './nodeDb';

const utf8 = (s: string) => new TextEncoder().encode(s);

const deps = (extra: Partial<ImportDeps> = {}): ImportDeps => ({
  sha256: (file) => Promise.resolve(createHash('sha256').update(file.bytes).digest('hex')),
  pdf: failingPdfReader('password'),
  now: () => 1_000,
  ...extra,
});

const story = 'The lamp was lit.\n\nShe opened the book and began to read aloud.';

describe('importFile', () => {
  it('adds a readable file to the library, ready to play', async () => {
    const db = testDb();
    const r = await importFile(
      db,
      { name: 'story.txt', bytes: utf8(story), source: 'file', uri: 'content://x' },
      deps(),
    );
    expect(r.status).toBe('ready');
    const id = r.status === 'ready' ? r.id : '';
    expect(getItem(db, id)).toMatchObject({
      title: 'story',
      status: 'ready',
      sourceUri: 'content://x',
      addedAt: 1_000,
    });
    expect(loadContent(db, id).sentences.length).toBeGreaterThan(1);
  });

  it('reports the same file again as a duplicate of the existing item', async () => {
    const db = testDb();
    const first = await importFile(db, { name: 'a.txt', bytes: utf8(story), source: 'file' }, deps());
    const again = await importFile(
      db,
      { name: 'copy of a.txt', bytes: utf8(story), source: 'share' },
      deps(),
    );
    expect(again).toEqual({ status: 'duplicate', id: first.status === 'ready' ? first.id : '' });
    expect(listItems(db)).toHaveLength(1);
  });

  it('refreshes text made by an older importer in place when the file is opened again', async () => {
    const db = testDb();
    const first = await importFile(db, { name: 'a.txt', bytes: utf8(story), source: 'file' }, deps());
    const id = first.status === 'ready' ? first.id : '';
    expect(getItem(db, id)?.importVersion).toBe(IMPORT_VERSION);
    // As if imported before the version was recorded, with the text cut short.
    db.run('UPDATE documents SET import_version = 0 WHERE id = ?', [id]);
    db.run("UPDATE blocks SET text = 'इ' WHERE document_id = ?", [id]);
    const again = await importFile(db, { name: 'a.txt', bytes: utf8(story), source: 'file' }, deps());
    expect(again).toEqual({ status: 'ready', id });
    expect(listItems(db)).toHaveLength(1);
    expect(getItem(db, id)?.importVersion).toBe(IMPORT_VERSION);
    expect(
      loadContent(db, id)
        .blocks.map((b) => b.text)
        .join(' '),
    ).toContain(story.split(' ')[0]);
  });

  it('refuses unreadable files without adding anything', async () => {
    const db = testDb();
    expect(await importFile(db, { name: 'novel.azw3', bytes: utf8('x'), source: 'file' }, deps())).toEqual({
      status: 'failed',
      id: null,
      code: 'drm',
    });
    expect(listItems(db)).toHaveLength(0);
  });

  it('keeps a failed item with its error, then retries it when the file comes back', async () => {
    const db = testDb();
    const pdf = {
      name: 'locked.pdf',
      bytes: utf8('%PDF-1.7 encrypted'),
      path: '/f/locked.pdf',
      source: 'file' as const,
    };
    const failed = await importFile(db, pdf, deps());
    expect(failed).toMatchObject({ status: 'failed', code: 'password' });
    const id = failed.status === 'failed' ? failed.id : null;
    expect(getItem(db, id ?? '')).toMatchObject({ status: 'failed', errorCode: 'password' });

    const page = {
      width: 612,
      height: 792,
      lines: [{ text: 'Reading aloud helps people follow long texts.', x: 72, y: 140, width: 400, size: 11 }],
    };
    const unlocked = deps({ pdf: fakePdfReader({ pages: [page], password: 'open' }) });
    expect(await importFile(db, { ...pdf, password: 'open' }, unlocked)).toEqual({ status: 'ready', id });
    expect(listItems(db)).toHaveLength(1);
  });

  it('records why a file could not be read', async () => {
    const db = testDb();
    const r = await importFile(db, { name: 'empty.txt', bytes: utf8('   \n\n  '), source: 'paste' }, deps());
    expect(r).toMatchObject({ status: 'failed', code: 'empty' });
  });

  it('stores an EPUB cover through the injected writer', async () => {
    const db = testDb();
    const covers: string[] = [];
    const r = await importFile(
      db,
      { name: 'book.epub', bytes: makeEpub({ cover: true }), source: 'file' },
      deps({
        saveCover: (docId, cover) => {
          covers.push(cover.mime);
          return Promise.resolve(`/covers/${docId}.jpg`);
        },
      }),
    );
    expect(r.status).toBe('ready');
    expect(covers).toHaveLength(1);
    expect(getItem(db, r.status === 'ready' ? r.id : '')).toMatchObject({ kind: 'book' });
  });
});
