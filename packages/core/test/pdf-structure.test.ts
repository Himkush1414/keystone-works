import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPdfDocument, type PdfLine, type PdfPage } from '../src/import/pdf';
import { segment } from '../src/text/segment';

const fixture = (name: string): PdfPage[] =>
  (
    JSON.parse(readFileSync(new URL(`./fixtures/pdf/${name}.json`, import.meta.url), 'utf8')) as {
      pages: PdfPage[];
    }
  ).pages;
const spoken = (pages: PdfPage[]) =>
  buildPdfDocument(pages, { title: 't', language: 'hi' }).blocks.filter((b) => b.skips.length === 0);

/** The first words of each paragraph of the newspaper page, as the source has them. */
// prettier-ignore
const NEWSPAPER = ['रमज़ान के पूरे तीस', 'हामिद भीतर जाकर दादी', 'अमीना का दिल कचोट', 'गाँव से मेला चला।', 'बड़ी-बड़ी इमारतें आने लगी।', 'मोहसिन बोला— चलो, मनों', 'मोहसिन—हाँ, उछल-कूद नहीं सकती,', 'आगे चले। हलवाइयों की', 'मोहसिन ने कहा—जिन्नात को', 'मोहसिन—एक-एक आसमान के बराबर', 'हामिद—लोग उन्हें कैसे खुश', 'मोहसिन—अब यह तो मैं', 'अब उसकी समझ में', 'आने चले। यह पुलिस'];

describe('PDF structure on real layouts', () => {
  it('reads a three-column Hindi newspaper page as headline, byline and its paragraphs, in order', () => {
    const blocks = spoken(fixture('newspaper-3col'));
    expect(blocks[0]).toMatchObject({ kind: 'heading', text: 'ईद के मेले में हामिद का चिमटा' });
    expect(blocks[1]?.text).toBe("विशेष संवाददाता · प्रेमचंद की कहानी 'ईदगाह' से");
    const paragraphs = blocks.slice(2);
    // Every paragraph starts where the source's does: none is cut where it runs into the next column.
    expect(paragraphs.map((b) => b.text.split(' ').slice(0, 4).join(' '))).toEqual(NEWSPAPER);
  });

  it('ends the Hindi sentences at । ? and ! only', () => {
    for (const b of spoken(fixture('newspaper-3col')).slice(2)) {
      const sentences = segment(b.text, 'hi').map((s) => b.text.slice(s.start, s.end));
      expect(sentences.length).toBeGreaterThan(0);
      for (const s of sentences) expect(s, s).toMatch(/[।?!॥]["”’']?$|[^।?!]$/u);
      // No sentence is a lone fragment of a word or two cut off a longer one.
      expect(sentences.filter((s) => s.split(' ').length <= 1).length).toBeLessThanOrEqual(1);
    }
  });

  it('keeps Hindi, English, Hinglish and mixed paragraphs apart, and skips header and page numbers', () => {
    const pages = fixture('mixed-hi-en');
    const all = buildPdfDocument(pages, { title: 't', language: 'hi' }).blocks;
    expect(all.filter((b) => b.skips.length).map((b) => b.text)).toEqual(['Mixed', '1', 'Mixed', '2']);
    const starts = all
      .filter((b) => b.skips.length === 0)
      .map((b) => b.text.split(' ').slice(0, 3).join(' '));
    expect(starts).toEqual([
      'Two languages, one',
      'रमज़ान के पूरे',
      'It is a',
      'मैंने उससे कहा',
      'However little known',
      'Kal exam hai',
      'हामिद भीतर जाकर',
    ]);
  });
});

const page = (lines: PdfLine[]): PdfPage => ({ width: 595, height: 842, lines });
const l = (text: string, x: number, y: number, extra: Partial<PdfLine> = {}): PdfLine => ({
  text,
  x,
  y,
  width: 160,
  size: 11,
  ...extra,
});
const texts = (pages: PdfPage[]) => spoken(pages).map((b) => b.text);
const full = 'यह एक लंबी पंक्ति है जो पूरे कॉलम में फैली हुई है और आगे बढ़ती है';

describe('PDF paragraphs', () => {
  it('runs a paragraph on from the foot of one column to the head of the next', () => {
    const lines = [
      l('पहला अनुच्छेद यहाँ शुरू होता है', 52, 100),
      ...Array.from({ length: 8 }, (_, i) => l(full, 44, 114 + i * 14)),
      l('और अगले कॉलम में', 44, 226),
      l('जारी रहता है। फिर यह खत्म होता है।', 232, 100, { width: 120 }),
      l('दूसरा अनुच्छेद नए कॉलम में', 240, 128),
      ...Array.from({ length: 6 }, (_, i) => l(full, 232, 142 + i * 14)),
    ];
    const t = texts([page(lines)]);
    expect(t).toHaveLength(2);
    expect(t[0]).toContain('और अगले कॉलम में जारी रहता है।');
    expect(t[1]?.startsWith('दूसरा अनुच्छेद')).toBe(true);
  });

  it('ends a paragraph at a column break when the column ended a sentence', () => {
    const lines = [
      ...Array.from({ length: 8 }, (_, i) => l(full, 44, 100 + i * 14)),
      l('यह वाक्य यहाँ खत्म होता है।', 44, 212),
      ...Array.from({ length: 8 }, (_, i) => l(full, 232, 100 + i * 14)),
    ];
    expect(texts([page(lines)])).toHaveLength(2);
  });

  it('measures an indent from the line’s own column, and ignores a one-off line further left', () => {
    const lines = [
      l('< पिछला पन्ना', 20, 80, { width: 60 }),
      ...Array.from({ length: 10 }, (_, i) => l(full, 82, 100 + i * 14, { width: 430 })),
    ];
    expect(texts([page(lines)])).toHaveLength(2); // the stray line, then one paragraph: no line looks indented
  });

  it('starts a new block at a byline set at another size, but not at OCR’s jittery sizes', () => {
    const byline = [
      l('संवाददाता की रिपोर्ट', 44, 80, { size: 12 }),
      ...Array.from({ length: 10 }, (_, i) => l(full, 44, 100 + i * 14)),
    ];
    expect(texts([page(byline)])).toHaveLength(2);
    const ocr = Array.from({ length: 12 }, (_, i) => l(full, 44, 100 + i * 18, { size: 15 + (i % 5) }));
    expect(texts([page(ocr)])).toHaveLength(1);
  });

  it('starts a new paragraph after ordinary paragraph spacing (1.4 lines)', () => {
    const lines = [
      ...Array.from({ length: 4 }, (_, i) => l(full, 44, 100 + i * 20)),
      l('बिना विराम चिह्न के अंत', 44, 160, { width: 90 }),
      ...Array.from({ length: 4 }, (_, i) => l(full, 44, 188 + i * 20)),
    ];
    expect(texts([page(lines)])).toHaveLength(2);
  });
});
