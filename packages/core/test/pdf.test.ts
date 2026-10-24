import { describe, expect, it } from 'vitest';
import {
  buildPdfDocument,
  classifyFurniture,
  cleanPdfText,
  joinLines,
  type PdfLine,
  type PdfPage,
} from '../src/import/pdf';
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
    expect(joinLines('remem\u00ad', 'bered')).toBe('remembered');
  });
  it('keeps real hyphens and capitalised continuations', () => {
    expect(joinLines('a self-', 'aware mind')).toBe('a self-aware mind');
    expect(joinLines('Franco-', 'German')).toBe('Franco- German');
    expect(joinLines('end of line', 'next')).toBe('end of line next');
  });
});

describe('classifyFurniture', () => {
  it('finds headers that repeat with changing numbers, alternating pages and page numbers', () => {
    const pages = paper(6);
    const edges = classifyFurniture(pages);
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
    expect(classifyFurniture(pages).size).toBe(0);
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

describe('cleanPdfText', () => {
  it('drops the NUL a glyph without a Unicode mapping turns into (Android cut text at the first one)', () => {
    expect(cleanPdfText('आज इ\u0000द आइ\u0000 है')).toBe('आज इद आइ है');
  });

  it('rejoins a vowel sign that a stray space separated from its letter', () => {
    expect(cleanPdfText('प्र ेमचंद')).toBe('प्रेमचंद');
    expect(cleanPdfText('वृक्षा ें पर')).toBe('वृक्षाें पर');
    // Ordinary spaces between words stay.
    expect(cleanPdfText('आज ईद आई है।')).toBe('आज ईद आई है।');
  });
});

/** A Hindi page: short lines ending with । close their paragraph, as a full stop does in English. */
function hindiPage(): PdfPage {
  const lines: PdfLine[] = [
    line('रमज़ान के पूरे तीस रोज़ के बाद आज ईद आई है। कितना मनोहर, कितना', 100),
    line('सुहावना प्रभात है।', 112, { width: 120 }),
    line('गाँव में कितनी हलचल है। ईदगाह जाने की तैयारियाँ हो रही हैं। किसी', 124),
    line('के कुरते में बटन नहीं है।', 136, { width: 160 }),
  ];
  return { width: W, height: H, lines };
}

describe('Hindi PDFs', () => {
  it('ends a paragraph at a short line that ends with a danda', () => {
    const d = buildPdfDocument([hindiPage()], { title: 'ईदगाह' });
    expect(d.blocks.map((b) => b.text)).toEqual([
      'रमज़ान के पूरे तीस रोज़ के बाद आज ईद आई है। कितना मनोहर, कितना सुहावना प्रभात है।',
      'गाँव में कितनी हलचल है। ईदगाह जाने की तैयारियाँ हो रही हैं। किसी के कुरते में बटन नहीं है।',
    ]);
  });
});

describe('chapters without an outline', () => {
  it('uses the biggest heading size that repeats, so a one-off title does not hide the chapters', () => {
    const pages: PdfPage[] = [1, 2, 3].map((n) => ({
      width: W,
      height: H,
      lines: [
        ...(n === 1 ? [line('Pride and Prejudice', 90, { size: 26, width: 300 })] : []),
        line(`Chapter ${n}`, 140, { size: 20, width: 120 }),
        line('It is a truth universally acknowledged, that a single man in possession', 180),
        line('of a good fortune must be in want of a wife.', 192, { width: 300 }),
      ],
    }));
    const d = buildPdfDocument(pages, { title: 'P' });
    expect(d.chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
    expect(d.chapters[0]?.blockStart).toBe(0);
  });
});

describe('a long book', () => {
  /** 520 pages: running header, page number, 30 body lines each, a chapter every 20 pages. */
  function book(): { pages: PdfPage[]; body: string[] } {
    const body: string[] = [];
    const pages = Array.from({ length: 520 }, (_, i): PdfPage => {
      const n = i + 1;
      const lines: PdfLine[] = [line('THE LONG BOOK', 30, { size: 8, width: 120 })];
      let y = 80;
      if (n % 20 === 1) {
        const title = `Chapter ${(n - 1) / 20 + 1}`;
        lines.push(line(title, y, { size: 18, width: 140 }));
        body.push(title);
        y += 40;
      }
      for (let k = 0; k < 30; k++, y += 12) {
        const text = `Page ${n} line ${k} carries on the story of the lamp and the reader`;
        lines.push(line(k === 29 ? `${text}.` : text, y, { width: k === 29 ? 300 : 460 }));
        body.push(k === 29 ? `${text}.` : text);
      }
      lines.push(line(String(n), 770, { size: 8, width: 12, x: 300 }));
      return { width: W, height: H, lines };
    });
    return { pages, body };
  }

  it('keeps every page and every character of the body; only page furniture is skipped', () => {
    const { pages, body } = book();
    const d = buildPdfDocument(pages, { title: 'Long' });
    const spoken = d.blocks.filter((b) => b.skips.length === 0);
    const squash = (s: string) => s.replace(/\s+/g, '');
    expect(squash(spoken.map((b) => b.text).join(''))).toBe(squash(body.join('')));
    expect(new Set(spoken.map((b) => b.page)).size).toBe(520);
    const furniture = d.blocks.filter((b) => b.skips.length > 0);
    expect(furniture.length).toBe(520 * 2);
    expect(new Set(furniture.map((b) => b.skips[0]?.reason))).toEqual(new Set(['header', 'pageNumber']));
    expect(d.chapters).toHaveLength(26);
    expect(d.meta.kind).toBe('book');
  });
});

describe('document-level furniture', () => {
  const page = (lines: PdfLine[]): PdfPage => ({ width: W, height: H, lines });
  const body = (n: number, k: number) =>
    line(`Line ${k} of page ${n} goes on with the story and never quite stops`, 100 + k * 12);

  it('skips Devanagari page numbers and a chapter title that runs over only its own pages', () => {
    const pages = Array.from({ length: 40 }, (_, i) =>
      page([
        line(i < 10 ? 'नाव' : `Other running title ${Math.floor(i / 10)}`, 40, { size: 8 }),
        body(i, 0),
        body(i, 1),
        line('०१२३४५६७८९'.slice(i % 10, (i % 10) + 1), 760, { size: 8, x: 300, width: 10 }),
      ]),
    );
    const kinds = classifyFurniture(pages);
    expect(kinds.get('0:0')).toBe('header');
    expect(kinds.get('3:3')).toBe('pageNumber');
    expect([...kinds.values()].filter((k) => k === 'header')).toHaveLength(40);
  });

  it('keeps a sentence that runs over a page whole, with the page furniture after it', () => {
    const pages = [
      page([
        line('Night fell over the river and the ferry, and the lamp on its prow was', 576),
        line('the only light for miles. Asha watched it, and the boatman watched her.', 588),
        line('The lamp burned all night while the ferry crossed the wide and', 600),
        line('1', 760, { size: 8, x: 300, width: 8 }),
      ]),
      page([
        line('THE RIVER', 40, { size: 8 }),
        line('unhurried river towards the town.', 100, { width: 200 }),
        line('2', 760, { size: 8, x: 300, width: 8 }),
      ]),
      page([
        line('THE RIVER', 40, { size: 8 }),
        line('Another paragraph.', 100, { width: 120 }),
        line('3', 760, { size: 8, x: 300, width: 8 }),
      ]),
    ];
    const d = buildPdfDocument(pages, { title: 'x' });
    expect(d.blocks.map((b) => [b.text, b.skips[0]?.reason])).toEqual([
      [
        'Night fell over the river and the ferry, and the lamp on its prow was the only light for miles. Asha watched it, and the boatman watched her. The lamp burned all night while the ferry crossed the wide and unhurried river towards the town.',
        undefined,
      ],
      ['1', 'pageNumber'],
      ['THE RIVER', 'header'],
      ['2', 'pageNumber'],
      ['THE RIVER', 'header'],
      ['Another paragraph.', undefined],
      ['3', 'pageNumber'],
    ]);
  });

  it('finds watermarks, the copyright page, footnotes, scan noise and margin numbers', () => {
    const pages = Array.from({ length: 10 }, (_, i) =>
      page([
        ...(i === 1
          ? [
              line('Copyright © 2021 Asha Verma', 300, { size: 9 }),
              line('First published in 2021 by Lantern House', 312, { size: 9 }),
            ]
          : []),
        body(i, 0),
        line('5', 112, { x: 40, width: 8, size: 8 }),
        body(i, 1),
        line("' . , '", 300, { x: 200, width: 30 }),
        line('* * *', 310, { x: 280, width: 30 }),
        line('Downloaded from www.books.example', 400, { size: 7, x: 150 }),
        line(`1 A note about ferry crossing ${'abcdefghij'[i]}.`, 700, { size: 8 }),
      ]),
    );
    const kinds = classifyFurniture(pages);
    const of = (pi: number, text: string) =>
      kinds.get(`${pi}:${pages[pi]?.lines.findIndex((l) => l.text === text)}`);
    expect(of(1, 'Copyright © 2021 Asha Verma')).toBe('copyright');
    expect(of(1, 'First published in 2021 by Lantern House')).toBe('copyright');
    expect(of(4, '5')).toBe('strayNumber');
    expect(of(4, "' . , '")).toBe('scanNoise');
    expect(of(4, '* * *')).toBeUndefined(); // a scene break: the narration pauses for it
    expect(of(4, 'Downloaded from www.books.example')).toBe('watermark');
    expect(of(4, '1 A note about ferry crossing e.')).toBe('footnote');
    expect(of(4, pages[4]?.lines[0]?.text ?? '')).toBeUndefined();
  });

  it('never skips body text for repeating alone, and keeps a copyright discussion in the body', () => {
    const pages = Array.from({ length: 6 }, (_, i) =>
      page([
        body(i, 0),
        line('The chorus came back again and again.', 300),
        line('Copyright law protects the expression of ideas.', 320),
      ]),
    );
    expect(classifyFurniture(pages).size).toBe(0);
  });
});
