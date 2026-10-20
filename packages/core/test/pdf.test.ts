import { describe, expect, it } from 'vitest';
import { buildPdfDocument, classifyEdges, joinLines, type PdfLine, type PdfPage } from '../src/import/pdf';
import { ImportError } from '../src/model';

const H = 792;
const W = 612;
const line = (text: string, y: number, extra: Partial<PdfLine> = {}): PdfLine => ({
  text,
  x: 72,
  y,
  width: 460,
  size: 10,
  ...extra,
});

/** A small academic-style paper: running header with page numbers, footer page numbers, one big heading. */
function paper(pages = 5): PdfPage[] {
  return Array.from({ length: pages }, (_, i) => {
    const n = i + 1;
    const lines: PdfLine[] = [
      line(n % 2 ? `Journal of Lamplight Studies ${n}` : `${n} Night Reading`, 40, { size: 8, width: 200 }),
    ];
    let y = 100;
    if (n === 1) {
      lines.push(line('The Quiet Lamp', y, { size: 18, width: 180 }));
      y += 40;
    }
    lines.push(line('Reading by lamplight was once the only way to read at night, and the warm', y));
    lines.push(line('light shaped how stories were told and remem-', (y += 12)));
    lines.push(line('bered by whole families.', (y += 12), { width: 150 }));
    lines.push(line('A second paragraph begins after a clear gap and continues on this line', (y += 30)));
    lines.push(line('with a self-', (y += 12), { width: 80 }));
    lines.push(line('aware closing thought.', y + 12, { width: 140 }));
    lines.push(line(String(n), 760, { size: 8, width: 10, x: 300 }));
    return { width: W, height: H, lines };
  });
}

describe('joinLines', () => {
  it('repairs words broken by a line-end hyphen', () => {
    expect(joinLines('remem-', 'bered by')).toBe('remembered by');
    expect(joinLines('remem­', 'bered')).toBe('remembered');
  });
  it('keeps real hyphens and capitalised continuations', () => {
    expect(joinLines('a self-', 'aware mind')).toBe('a self-aware mind');
    expect(joinLines('Franco-', 'German')).toBe('Franco- German');
    expect(joinLines('end of line', 'next')).toBe('end of line next');
  });
});

describe('classifyEdges', () => {
  it('finds headers that repeat with changing numbers, alternating pages and page numbers', () => {
    const pages = paper(6);
    const edges = classifyEdges(pages);
    expect(edges.get('0:0')).toBe('header');
    expect(edges.get('1:0')).toBe('header');
    const lastLine = (pages[0]?.lines.length ?? 1) - 1;
    expect(edges.get(`0:${lastLine}`)).toBe('pageNumber');
    expect(edges.get('0:1')).toBeUndefined();
  });

  it('does not flag a one-off line near the edge', () => {
    const pages: PdfPage[] = [
      { width: W, height: H, lines: [line('A unique epigraph at the top', 30), line('Body', 300)] },
      { width: W, height: H, lines: [line('Body again', 300)] },
      { width: W, height: H, lines: [line('More body', 300)] },
    ];
    expect(classifyEdges(pages).size).toBe(0);
  });
});

describe('buildPdfDocument', () => {
  it('turns lines into paragraphs and headings, skipping page furniture', () => {
    const d = buildPdfDocument(paper(5), { title: 'The Quiet Lamp' });
    const spoken = d.blocks.filter((b) => b.skips.length === 0);
    expect(spoken[0]).toMatchObject({ kind: 'heading', text: 'The Quiet Lamp', level: 1 });
    expect(spoken[1]?.text).toBe(
      'Reading by lamplight was once the only way to read at night, and the warm light shaped how stories were told and remembered by whole families.',
    );
    expect(spoken[2]?.text).toBe(
      'A second paragraph begins after a clear gap and continues on this line with a self-aware closing thought.',
    );
    const skipped = d.blocks.filter((b) => b.skips.length > 0).map((b) => b.skips[0]?.reason);
    expect(new Set(skipped)).toEqual(new Set(['header', 'pageNumber']));
    expect(d.meta.kind).toBe('document');
  });

  it('builds chapters from the outline', () => {
    const d = buildPdfDocument(paper(5), { title: 'T' }, [
      { title: 'The Quiet Lamp', page: 1, level: 0 },
      { title: 'Later', page: 3, level: 0 },
    ]);
    expect(d.chapters.map((c) => c.title)).toEqual(['The Quiet Lamp', 'Later']);
    expect(d.chapters[0]?.blockStart).toBe(0);
    expect(d.blocks[d.chapters[1]?.blockStart ?? 0]?.page).toBe(3);
  });

  it('rejects scanned PDFs with no text layer', () => {
    const scanned: PdfPage[] = [{ width: W, height: H, lines: [] }];
    expect(() => buildPdfDocument(scanned, { title: 'x' })).toThrow(ImportError);
    try {
      buildPdfDocument(scanned, { title: 'x' });
    } catch (e) {
      expect((e as ImportError).code).toBe('scanned');
    }
  });

  it('calls long PDFs books', () => {
    expect(buildPdfDocument(paper(61), { title: 'x' }).meta.kind).toBe('book');
  });
});
