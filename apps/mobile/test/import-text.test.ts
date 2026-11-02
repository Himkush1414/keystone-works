import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data/content';
import { getItem, IMPORT_VERSION, listItems } from '../src/data/library';
import { getPosition, savePosition } from '../src/data/userdata';
import { SAMPLES } from '../src/import/samples';
import { importSample, importText, pastedTitle, refreshStaleSamples } from '../src/import/text';
import type { ImportDeps } from '../src/import/run';
import { failingPdfReader } from './fakePdf';
import { testDb } from './nodeDb';

const deps: ImportDeps = {
  sha256: (file) => Promise.resolve(createHash('sha256').update(file.bytes).digest('hex')),
  pdf: failingPdfReader('not expected'),
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

describe('importSample', () => {
  it('adds each bundled sample as a ready item with its author, and Cast finds the dialogue', async () => {
    const db = testDb();
    for (const sample of SAMPLES) {
      const r = await importSample(db, sample, deps);
      expect(r.status).toBe('ready');
      const id = r.status === 'ready' ? r.id : '';
      expect(getItem(db, id)).toMatchObject({
        title: sample.title,
        author: sample.author,
        kind: sample.kind,
        source: 'sample',
      });
    }
    const austen = listItems(db).find((i) => i.author === 'Jane Austen');
    const sentences = loadContent(db, austen?.id ?? '').sentences;
    expect(sentences.some((s) => s.kind === 'dialogue')).toBe(true);
    expect(sentences.some((s) => s.kind === 'heading')).toBe(true);
  });

  it('opens the copy already in the library when the same sample is chosen again', async () => {
    const db = testDb();
    const sample = SAMPLES[0];
    if (!sample) throw new Error('no samples');
    const first = await importSample(db, sample, deps);
    expect((await importSample(db, sample, deps)).status).toBe('duplicate');
    expect(first.status).toBe('ready');
  });
});

describe('refreshStaleSamples', () => {
  it('imports a sample stored by an older importer again, in place', async () => {
    const db = testDb();
    const sample = SAMPLES[0];
    if (!sample) throw new Error('no samples');
    const first = await importSample(db, sample, deps);
    const id = first.status === 'ready' ? first.id : '';
    savePosition(db, id, { sentenceOrd: 7, offsetMs: 0, progress: 0.2, listenedDeltaMs: 0 }, 1);
    // As an older version left it: an earlier import version and the underscores still in the text.
    db.run('UPDATE documents SET import_version = ? WHERE id = ?', [IMPORT_VERSION - 1, id]);
    db.run(
      "UPDATE blocks SET text = replace(text, 'certainly have had', 'certainly _have_ had') WHERE document_id = ?",
      [id],
    );
    expect(loadContent(db, id).blocks.some((b) => b.text.includes('_have_'))).toBe(true);

    expect(await refreshStaleSamples(db, deps)).toEqual([id]);
    expect(listItems(db)).toHaveLength(1);
    expect(getItem(db, id)?.importVersion).toBe(IMPORT_VERSION);
    expect(loadContent(db, id).blocks.some((b) => b.text.includes('_have_'))).toBe(false);
    expect(getPosition(db, id)?.sentenceOrd).toBe(7);
  });

  it('leaves current samples and everything else alone', async () => {
    const db = testDb();
    const sample = SAMPLES[1];
    if (!sample) throw new Error('no samples');
    await importSample(db, sample, deps);
    const pasted = await importText(db, { text: 'Some pasted words.' }, deps);
    const pastedId = pasted.status === 'ready' ? pasted.id : '';
    db.run('UPDATE documents SET import_version = 0 WHERE id = ?', [pastedId]);
    expect(await refreshStaleSamples(db, deps)).toEqual([]);
  });
});
