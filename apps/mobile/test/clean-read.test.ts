import { buildPdfDocument, prepareDocument, type PdfPage } from '@lamplight/core';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data/content';
import { createDocument, getItem, saveContent } from '../src/data/library';
import { changeCleanRead, cleanReadRows, planSession, type SessionSettings } from '../src/player/session';
import { createPlayerStore } from '../src/player/store';
import { testDb } from './nodeDb';

const SETTINGS: SessionSettings = {
  castMode: 'full',
  quality: 'auto',
  defaultSpeed: 1,
  voices: {},
  speakUrls: true,
  rewindOnResume: true,
};

const line = (text: string, y: number) => ({ text, x: 72, y, width: 400, size: 11 });
const page = (n: number): PdfPage => ({
  width: 612,
  height: 792,
  lines: [
    line('Journal of Quiet Studies', 30),
    line(`Reading aloud helps people follow long texts [${n}]. It also helps them remember.`, 200),
    line(String(n), 770),
  ],
});

function seed() {
  const db = testDb();
  const id = createDocument(db, { kind: 'document', title: 'Paper', source: 'file' });
  saveContent(
    db,
    id,
    prepareDocument(buildPdfDocument([1, 2, 3, 4].map(page), { title: 'Paper' }), { fromPdf: true }),
  );
  return { db, id };
}

const spokenText = (db: ReturnType<typeof testDb>, id: string) =>
  planSession(db, id, SETTINGS)
    .queue.segments.map((s) => s.text)
    .join(' ');

describe('Clean Read review', () => {
  it('reports what each detector found, with examples, and that it is on', () => {
    const { db, id } = seed();
    const item = getItem(db, id);
    if (!item) throw new Error('no item');
    const rows = cleanReadRows(item, loadContent(db, id), true);
    const citation = rows.find((r) => r.reason === 'citation');
    expect(citation).toMatchObject({ count: 4, on: true });
    expect(citation?.examples.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.count > 0)).toBe(true);
  });

  it('turns a detector off for this document and speaks what it skipped', async () => {
    const { db, id } = seed();
    expect(spokenText(db, id)).not.toMatch(/\[\d\]/);
    const store = createPlayerStore();
    const sent: string[] = [];
    const engine = {
      updateSegments: (j: string) => (sent.push(j), Promise.resolve()),
      setQuality: () => Promise.resolve(),
    };
    await changeCleanRead({ db, store, engine }, id, 'citation', false, SETTINGS, 0);
    expect(getItem(db, id)?.settings.clean?.citation).toBe(false);
    const item = getItem(db, id);
    if (!item) throw new Error('no item');
    expect(cleanReadRows(item, loadContent(db, id), true).find((r) => r.reason === 'citation')?.on).toBe(
      false,
    );
    expect(sent).toHaveLength(1);
    // The sentences keep their numbers, so the listener stays where they are.
    expect(planSession(db, id, SETTINGS).queue.segments.length).toBe(
      (JSON.parse(sent[0] ?? '{}') as { segments: unknown[] }).segments.length + 1,
    );
  });
});
