import { describe, expect, it } from 'vitest';
import {
  cleanReport,
  defaultCleanSettings,
  detectInBlock,
  detectSkips,
  effectiveSkips,
} from '../src/clean/detect';
import type { Block, DocumentDraft } from '../src/model';

const para = (text: string, extra: Partial<Block> = {}): Block => ({
  kind: 'paragraph',
  text,
  skips: [],
  ...extra,
});
const cut = (b: Block, reason?: string) =>
  b.skips.filter((s) => !reason || s.reason === reason).map((s) => b.text.slice(s.start, s.end));

describe('detectInBlock', () => {
  it('finds numeric and author-year citations', () => {
    const b = para('Lamps changed reading [3], [4–7] and habits (Smith, 2020; Jones & Lee, 1999b).');
    const found = detectInBlock(b, false).map((s) => b.text.slice(s.start, s.end));
    expect(found).toContain('[3]');
    expect(found).toContain('[4–7]');
    expect(found).toContain('(Smith, 2020; Jones & Lee, 1999b)');
  });

  it('does not treat ordinary parentheses as citations', () => {
    const b = para('He waited (as always) for the 2020 edition.');
    expect(detectInBlock(b, false)).toEqual([]);
  });

  it('finds superscript footnote markers, and glued markers only in PDFs', () => {
    const b = para('This was known.¹² Later, others agreed.3 Then more.');
    const plain = detectInBlock(b, false).map((s) => b.text.slice(s.start, s.end));
    expect(plain).toEqual(['¹²']);
    const pdf = detectInBlock(b, true).map((s) => b.text.slice(s.start, s.end));
    expect(pdf).toEqual(['¹²', '3']);
  });

  it('finds asterisk and dagger footnote markers glued to what they annotate, not a lone asterisk', () => {
    const b = para('The ferry ran until 1962.* The ghat was rebuilt† later. 3 * 4 is twelve.');
    expect(detectInBlock(b, false).map((s) => b.text.slice(s.start, s.end))).toEqual(['*', '†']);
  });

  it('marks a short copyright notice in any format, but not a sentence about copyright', () => {
    const notice = para('© 2026 The Daily Lamp. All rights reserved.');
    expect(detectInBlock(notice, false)).toEqual([
      { start: 0, end: notice.text.length, reason: 'copyright' },
    ]);
    expect(
      detectInBlock(para('Copyright law protects how an idea is expressed, not the idea.'), false),
    ).toEqual([]);
  });

  it('finds links and e-mail addresses', () => {
    const b = para('See https://lamplight.app/help or write to help@lamplight.app.');
    expect(detectInBlock(b, false).map((s) => b.text.slice(s.start, s.end))).toEqual([
      'https://lamplight.app/help',
      'help@lamplight.app',
    ]);
  });

  it('marks captions and code as whole blocks', () => {
    expect(detectInBlock(para('Figure 3: Lamp sales by year.'), false)[0]?.reason).toBe('caption');
    expect(detectInBlock(para('Tabelle 2.1 – Ergebnisse'), false)[0]?.reason).toBe('caption');
    expect(detectInBlock({ kind: 'code', text: 'npm i', skips: [] }, false)).toEqual([
      { start: 0, end: 5, reason: 'code' },
    ]);
    expect(detectInBlock(para('Figures of speech are fun.'), false)).toEqual([]);
  });
});

describe('detectSkips', () => {
  const draft = (blocks: Block[]): DocumentDraft => ({
    meta: { title: 'T', kind: 'document' },
    chapters: [],
    blocks,
  });

  it('keeps importer skips and merges overlaps', () => {
    const d = detectSkips(
      draft([
        para('Journal of Light 12 Body text [1].', { skips: [{ start: 0, end: 19, reason: 'header' }] }),
      ]),
    );
    const b = d.blocks[0];
    expect(b && cut(b)).toEqual(['Journal of Light 12', '[1]']);
  });

  it('marks the references section near the end, up to the next heading', () => {
    const blocks: Block[] = [
      { kind: 'heading', text: 'Introduction', level: 1, skips: [] },
      ...Array.from({ length: 8 }, (_, i) => para(`Body ${i}.`)),
      { kind: 'heading', text: 'References', level: 1, skips: [] },
      para('Smith, J. (2020). Light. Lamp Press.'),
      para('Jones, A. (1999). Reading. Night Books.'),
      { kind: 'heading', text: 'Appendix', level: 1, skips: [] },
      para('Extra material.'),
    ];
    const d = detectSkips(draft(blocks));
    const reasons = d.blocks.map((b) => b.skips[0]?.reason ?? null);
    expect(reasons.slice(9, 12)).toEqual(['references', 'references', 'references']);
    expect(reasons[12]).toBeNull();
    expect(reasons[13]).toBeNull();
  });

  it('does not treat an early "Sources" heading as the bibliography', () => {
    const blocks: Block[] = [
      { kind: 'heading', text: 'Sources', level: 1, skips: [] },
      ...Array.from({ length: 5 }, (_, i) => para(`Body ${i}.`)),
    ];
    expect(detectSkips(draft(blocks)).blocks.every((b) => b.skips.length === 0)).toBe(true);
  });
});

describe('effectiveSkips', () => {
  it('filters by settings and adds custom phrases case-insensitively', () => {
    const b = para('Draft — confidential. See [2] and https://x.org now. CONFIDENTIAL again.');
    const all = detectSkips({ meta: { title: 't', kind: 'document' }, chapters: [], blocks: [b] }).blocks[0];
    expect(all).toBeDefined();
    if (!all) return;
    const s = { ...defaultCleanSettings('document', false) };
    const texts = (skips: { start: number; end: number }[]) =>
      skips.map((k) => all.text.slice(k.start, k.end));
    expect(texts(effectiveSkips(all, s))).toEqual(['[2]']);
    expect(texts(effectiveSkips(all, { ...s, url: true }))).toEqual(['[2]', 'https://x.org']);
    expect(texts(effectiveSkips(all, { ...s, citation: false }, ['confidential']))).toEqual([
      'confidential',
      'CONFIDENTIAL',
    ]);
  });

  it('defaults citations on for PDFs and documents, off for books', () => {
    expect(defaultCleanSettings('book', false).citation).toBe(false);
    expect(defaultCleanSettings('book', true).citation).toBe(true);
    expect(defaultCleanSettings('document', false).citation).toBe(true);
  });
});

describe('cleanReport', () => {
  it('counts per reason with up to two examples', () => {
    const d = detectSkips({
      meta: { title: 't', kind: 'document' },
      chapters: [],
      blocks: [para('A [1] b [2] c [3].'), para('Figure 1: Lamps.')],
    });
    expect(cleanReport(d)).toEqual([
      { reason: 'citation', count: 3, examples: ['[1]', '[2]'] },
      { reason: 'caption', count: 1, examples: ['Figure 1: Lamps.'] },
    ]);
  });
});
