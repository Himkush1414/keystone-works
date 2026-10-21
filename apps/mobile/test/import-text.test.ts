import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getItem, listItems } from '../src/data/library';
import { importText, pastedTitle } from '../src/import/text';
import type { ImportDeps } from '../src/import/run';
import { testDb } from './nodeDb';

const deps: ImportDeps = {
  sha256: (file) => Promise.resolve(createHash('sha256').update(file.bytes).digest('hex')),
  extractPdf: () => Promise.reject(new Error('not expected')),
};

describe('pastedTitle', () => {
  it('uses the first line that has text', () => {
    expect(pastedTitle('\n\n  Self-driving   cars  \nand more')).toBe('Self-driving cars');
  });

  it('cuts a long first line at a word boundary', () => {
    const t = pastedTitle(
      `${'The harbour had gone quiet and the boats knocked softly against the wall'} again.`,
    );
    expect(t).toBe('The harbour had gone quiet and the boats knocked softly…');
    expect(t.length).toBeLessThanOrEqual(61);
  });

  it('falls back when there is nothing to name it by', () => {
    expect(pastedTitle('   ')).toBe('Untitled');
  });
});

describe('importText', () => {
  it('adds pasted text as a document titled by its first line', async () => {
    const db = testDb();
    const r = await importText(db, { text: 'Self-driving cars\n\nThey are coming. Slowly.' }, deps);
    expect(r.status).toBe('ready');
    expect(getItem(db, r.status === 'ready' ? r.id : '')).toMatchObject({
      title: 'Self-driving cars',
      source: 'paste',
    });
  });

  it('prefers the title the listener typed', async () => {
    const db = testDb();
    const r = await importText(db, { text: 'Some notes to hear later.', title: '  Meeting notes ' }, deps);
    expect(getItem(db, r.status === 'ready' ? r.id : '')?.title).toBe('Meeting notes');
  });

  it('recognises the same text pasted twice', async () => {
    const db = testDb();
    const first = await importText(db, { text: 'Read me aloud, please.' }, deps);
    const again = await importText(db, { text: 'Read me aloud, please.', title: 'Other' }, deps);
    expect(again).toEqual({ status: 'duplicate', id: first.status === 'ready' ? first.id : '' });
    expect(listItems(db)).toHaveLength(1);
  });

  it('refuses empty text without touching the library', async () => {
    const db = testDb();
    expect(await importText(db, { text: ' \n ' }, deps)).toEqual({
      status: 'failed',
      id: null,
      code: 'empty',
    });
    expect(listItems(db)).toHaveLength(0);
  });
});
