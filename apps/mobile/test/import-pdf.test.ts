import type { PdfLine, PdfPage } from '@lamplight/core';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../src/data/content';
import { getItem } from '../src/data/library';
import { importFile, type ImportDeps } from '../src/import/run';
import { PDF_FIRST_PAGES } from '../src/import/parse';
import { fakePdfReader, type FakePdf } from './fakePdf';
import { testDb } from './nodeDb';

const W = 612;
const H = 792;
const line = (text: string, y: number, extra: Partial<PdfLine> = {}): PdfLine => ({
  text,
  x: 72,
  y,
  width: 460,
  size: 10,
  ...extra,
});

/** `n` pages: a running header, a page number, two paragraphs, and a chapter heading every 10 pages. */
function book(n: number): { pages: PdfPage[]; body: string[] } {
  const body: string[] = [];
  const pages = Array.from({ length: n }, (_, i): PdfPage => {
    const p = i + 1;
    const lines: PdfLine[] = [line('A LONG BOOK', 30, { size: 8, width: 100 })];
    let y = 90;
    if (p % 10 === 1) {
      lines.push(line(`Chapter ${(p - 1) / 10 + 1}`, y, { size: 18, width: 140 }));
      body.push(`Chapter ${(p - 1) / 10 + 1}`);
      y += 40;
    }
    for (const k of [0, 1]) {
      const a = `On page ${p} the reader turned to paragraph ${k} and kept going through the`;
      const b = `night until the lamp burned low.`;
      lines.push(line(a, y), line(b, y + 12, { width: 220 }));
      body.push(a, b);
      y += 40;
    }
    lines.push(line(String(p), 770, { size: 8, width: 12, x: 300 }));
    return { width: W, height: H, lines };
  });
  return { pages, body };
}

function harness(pdf: FakePdf) {
  const reader = fakePdfReader(pdf);
  const updates: string[] = [];
  const tasks: Promise<void>[] = [];
  const deps: ImportDeps = {
    sha256: () => Promise.resolve('sha-' + pdf.pages.length),
    pdf: reader,
    onUpdate: (id, replaced) => updates.push(replaced ? 'replaced' : 'update'),
    yieldToUi: () => new Promise((resolve) => setTimeout(resolve, 0)),
    background: (t) => void tasks.push(t),
  };
  return { reader, updates, tasks, deps };
}

const file = { name: 'long_book.pdf', bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), path: '/a.pdf', source: 'file' as const };
const spokenText = (db: ReturnType<typeof testDb>, id: string) =>
  loadContent(db, id)
    .blocks.filter((b) => b.skips.length === 0)
    .map((b) => b.text)
    .join('')
    .replace(/\s+/g, '');

describe('importing a long PDF', () => {
  it('is playable after its first pages, and the whole book arrives in the background', async () => {
    const db = testDb();
    const { pages, body } = book(100);
    const h = harness({ pages });
    const r = await importFile(db, file, h.deps);
    expect(r.status).toBe('ready');
    const id = r.status === 'ready' ? r.id : '';

    // Returned after the first pages: the library shows it as loading, and it can be played.
    expect(h.reader.calls).toEqual(['open /a.pdf', `pages 1-${PDF_FIRST_PAGES}`]);
    expect(getItem(db, id)).toMatchObject({ status: 'ready', kind: 'book', loading: { pages: 12, of: 100 } });
    const first = loadContent(db, id);
    expect(Math.max(...first.blocks.map((b) => b.page ?? 0))).toBe(12);
    expect(first.sentences.length).toBeGreaterThan(20);

    await Promise.all(h.tasks);
    expect(h.reader.calls.slice(2)).toEqual(['pages 13-52', 'pages 53-92', 'pages 93-100', 'close']);
    expect(getItem(db, id)?.loading).toBeNull();
    expect(h.updates.at(-1)).toBe('replaced');

    // Every page is there, and the spoken text is the body, character for character.
    const whole = loadContent(db, id);
    expect(new Set(whole.blocks.map((b) => b.page)).size).toBe(100);
    expect(spokenText(db, id)).toBe(body.join('').replace(/\s+/g, ''));
    expect(whole.chapters.map((c) => c.title)).toHaveLength(10);
  });

  it('keeps reading past pages without text before showing anything', async () => {
    const db = testDb();
    const { pages } = book(60);
    const blank = Array.from({ length: 15 }, (): PdfPage => ({ width: W, height: H, lines: [] }));
    const h = harness({ pages: [...blank, ...pages] });
    const r = await importFile(db, file, h.deps);
    expect(r.status).toBe('ready');
    expect(h.reader.calls).toEqual(['open /a.pdf', 'pages 1-12', 'pages 13-52']);
    await Promise.all(h.tasks);
    expect(getItem(db, r.status === 'ready' ? r.id : '')?.loading).toBeNull();
  });

  it('says a PDF made only of images is scanned, instead of showing an empty book', async () => {
    const db = testDb();
    const pages = Array.from({ length: 30 }, (): PdfPage => ({ width: W, height: H, lines: [] }));
    const h = harness({ pages });
    const r = await importFile(db, file, h.deps);
    expect(r).toMatchObject({ status: 'failed', code: 'scanned' });
    expect(getItem(db, r.status === 'failed' ? (r.id ?? '') : '')).toMatchObject({
      status: 'failed',
      errorCode: 'scanned',
      loading: null,
    });
    expect(h.reader.calls.at(-1)).toBe('close');
  });

  it('stores Hindi text whole: no NUL characters, vowel signs joined to their letters', async () => {
    const db = testDb();
    const page: PdfPage = {
      width: W,
      height: H,
      lines: [line('इ\u0000दगाह', 80, { size: 20, width: 80 }), line('प्र ेमचंद की कहानी। आज ईद आई है।', 120)],
    };
    const r = await importFile(db, { ...file, name: 'idgah.pdf' }, harness({ pages: [page] }).deps);
    const text = loadContent(db, r.status === 'ready' ? r.id : '').blocks.map((b) => b.text).join(' ');
    expect(text).not.toContain('\u0000');
    expect(text).toContain('प्रेमचंद की कहानी। आज ईद आई है।');
  });
});
