import { COPYRIGHT } from '../clean/detect';
import { isSceneBreak } from '../perform/plan';
import {
  ImportError,
  type Block,
  type Chapter,
  type DocumentDraft,
  type DocumentMeta,
  type Skip,
  type SkipReason,
} from '../model';

/** One line of text with its position, as extracted from a PDF page (top-left origin, PDF points). */
export interface PdfLine {
  text: string;
  x: number;
  y: number;
  width: number;
  /** Font size of the line's dominant run. */
  size: number;
}

export interface PdfPage {
  width: number;
  height: number;
  lines: PdfLine[];
}

export interface PdfOutlineItem {
  title: string;
  /** 1-based page number. */
  page: number;
  level: number;
}

const EDGE = 0.085;
/** Prefixes whose hyphen is part of the word ("self-aware"), so a line-break hyphen after them is kept. */
const KEEP_HYPHEN =
  /(?:^|[^\p{L}])(?:self|well|non|ex|co|anti|post|pre|pro|semi|multi|cross|half|quasi|all|vice)$/iu;

/** Digits in any script become '#', so "12 Night Reading" and "१३ Night Reading" are the same running line. */
const normalizeLine = (s: string) =>
  s
    .toLowerCase()
    .replace(/\p{Nd}+/gu, '#')
    .replace(/\s+/g, ' ')
    .trim();
const isPageNumber = (s: string) =>
  /^(?:page|seite|página|pagina|p\.|पृष्ठ|पृ\.)?\s*\p{Nd}{1,4}(?:\s*(?:of|von|de|di|\/)\s*\p{Nd}{1,4})?$/iu.test(
    s.trim(),
  ) ||
  /^[ivxlcdm]{1,7}$/iu.test(s.trim()) ||
  /^[-–—]\s*\p{Nd}{1,4}\s*[-–—]$/u.test(s.trim());
const ENDS_SENTENCE = /[.!?।॥"”’]$/u;
/** Lines publishers and download sites stamp across pages. */
const WATERMARK_HINT =
  /(?:down|up)loaded\s+(?:from|by)|(?:licensed|sold)\s+to\b|personal use only|not for (?:sale|distribution)|\bconfidential\b|^(?:draft|sample|preview|watermark)$|www\.|https?:\/\//iu;
/** Lines of a copyright page that are not copyright notices themselves. */
const FRONT_MATTER =
  /^(?:published (?:by|in)|first published|this edition|(?:re)?printed (?:in|by)|typeset|cover (?:design|image|illustration)|library of congress|british library|catalogu?e? record|cataloging|प्रकाशक|प्रथम संस्करण|संस्करण|मुद्रक|आवरण)/iu;
const FOOTNOTE_START = /^(?:\p{Nd}{1,3}[.)]?\s|[*†‡§¶]+\s?|[¹²³⁴⁵⁶⁷⁸⁹⁰]+\s?)\S/u;

function median(values: number[]): number {
  if (!values.length) return 0;
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? (v[m] ?? 0) : ((v[m - 1] ?? 0) + (v[m] ?? 0)) / 2;
}

export type Furniture = Extract<
  SkipReason,
  'header' | 'footer' | 'pageNumber' | 'watermark' | 'copyright' | 'footnote' | 'scanNoise' | 'strayNumber'
>;

/**
 * Whether a line seen on `pages` (sorted page indexes) repeats like page furniture: on 30% of the document,
 * or, when `dense` counts (a chapter's running title), on at least a quarter of the pages between its first
 * and last appearance.
 */
function repeats(pages: readonly number[], total: number, min: number, dense: boolean): boolean {
  const n = pages.length;
  if (n >= Math.max(min, Math.ceil(total * 0.3))) return true;
  if (!dense || n < Math.max(min, 3)) return false;
  return n / ((pages[n - 1] ?? 0) - (pages[0] ?? 0) + 1) >= 0.25;
}

function seen(map: Map<string, number[]>, key: string, page: number) {
  const list = map.get(key) ?? [];
  if (list[list.length - 1] !== page) list.push(page);
  map.set(key, list);
}

/**
 * Finds the lines of a PDF that are not part of what it says, by looking at the whole document: running headers
 * and footers and page numbers (repeated near the same edge), watermarks (repeated anywhere), copyright and
 * publishing pages, footnotes (small text at the foot of a page, starting with a marker), stray symbols and scan
 * noise, and numbers standing alone in the body. Keys are `${page}:${lineIndex}`.
 */
export function classifyFurniture(pages: readonly PdfPage[]): Map<string, Furniture> {
  const result = new Map<string, Furniture>();
  const edgeSeen = new Map<string, number[]>();
  const bodySeen = new Map<string, number[]>();
  const edges = pages.map((p) => p.lines.map((l) => atEdge(l, p)));
  const texts = pages.map((p) => p.lines.map((l) => l.text.trim()));
  const bodySize =
    median(pages.flatMap((p, pi) => p.lines.filter((_, li) => !edges[pi]?.[li]).map((l) => l.size))) || 10;

  pages.forEach((p, pi) =>
    p.lines.forEach((_, li) => {
      const edge = edges[pi]?.[li];
      const text = texts[pi]?.[li] ?? '';
      if (!edge) seen(bodySeen, text, pi);
      else if (!isPageNumber(text)) seen(edgeSeen, `${edge}|${normalizeLine(text)}`, pi);
    }),
  );

  // A watermark repeats word for word and looks stamped on: it says so, or it's set at another size than the
  // text. Body text never goes on repetition alone.
  const stamped = (text: string, size: number) => {
    const where = bodySeen.get(text) ?? [];
    if (where.length < 2) return false;
    if (WATERMARK_HINT.test(text)) return true;
    return Math.abs(size - bodySize) > bodySize * 0.15 && repeats(where, pages.length, 3, false);
  };
  const frontPages = Math.max(6, Math.ceil(pages.length * 0.03));
  pages.forEach((p, pi) => {
    const lineTexts = texts[pi] ?? [];
    const copyrightPage =
      (pi < frontPages || pi >= pages.length - 3) &&
      lineTexts.some((t) => COPYRIGHT.test(t)) &&
      lineTexts.filter((t) => COPYRIGHT.test(t) || FRONT_MATTER.test(t)).length >= 2;
    const kinds: (Furniture | undefined)[] = [];

    p.lines.forEach((l, li) => {
      const text = lineTexts[li] ?? '';
      const edge = edges[pi]?.[li];
      let kind: Furniture | undefined;
      if (edge) {
        if (isPageNumber(text)) kind = 'pageNumber';
        else if (
          repeats(
            edgeSeen.get(`${edge}|${normalizeLine(text)}`) ?? [],
            pages.length,
            2,
            !ENDS_SENTENCE.test(text),
          )
        )
          kind = edge === 'top' ? 'header' : 'footer';
      }
      if (!kind) {
        if (copyrightPage || (text.length < 160 && COPYRIGHT.test(text))) kind = 'copyright';
        else if (text.length <= 40 && isNoise(text)) kind = 'scanNoise';
        else if (/^\p{Nd}{1,4}$/u.test(text) && l.size < bodySize * 1.18) kind = 'strayNumber';
        else if (!edge && text.length < 100 && stamped(text, l.size)) kind = 'watermark';
      }
      kinds.push(kind);
    });

    // Footnotes: the run of small lines at the foot of the page (above any footer), from the first one that
    // starts with a marker, below at least one line of body text.
    const below = p.lines
      .map((l, li) => ({ l, li }))
      .filter(({ li }) => !kinds[li])
      .sort((a, b) => b.l.y - a.l.y);
    let run = 0;
    while (run < below.length && (below[run]?.l.size ?? 0) <= bodySize * 0.9) run++;
    if (run > 0 && run < below.length) {
      const foot = below.slice(0, run).reverse();
      const first = foot.findIndex(({ li }) => FOOTNOTE_START.test(lineTexts[li] ?? ''));
      if (first >= 0) for (const { li } of foot.slice(first)) kinds[li] = 'footnote';
    }
    kinds.forEach((k, li) => k && result.set(`${pi}:${li}`, k));
  });
  return result;
}

/** A line of symbols or scan debris: no letters or digits, or under a third of them. Scene breaks don't count. */
function isNoise(text: string): boolean {
  const signs = text.replace(/\s+/g, '');
  if (!signs || isSceneBreak(text)) return false;
  const wordy = (signs.match(/[\p{L}\p{M}\p{Nd}]/gu) ?? []).length;
  return wordy === 0 || (signs.length >= 5 && wordy / signs.length < 0.3);
}

function atEdge(l: PdfLine, p: PdfPage): 'top' | 'bottom' | null {
  if (l.y < p.height * EDGE) return 'top';
  if (l.y > p.height * (1 - EDGE)) return 'bottom';
  return null;
}

/**
 * Text as PDF extraction leaves it, made safe to store and speak: control characters dropped (a glyph with no
 * Unicode mapping comes out as NUL, and Android's text stack ends a string at the first NUL, which cut
 * paragraphs short) and a vowel sign or other combining mark rejoined to the letter a stray space separated
 * it from (it would otherwise be drawn on a dotted circle, apart from its word).
 */
export function cleanPdfText(text: string): string {
  return text.replace(CONTROL, '').replace(/(\p{L}\p{M}*)[ \u00a0]+(?=\p{M})/gu, '$1');
}

// eslint-disable-next-line no-control-regex -- dropping control characters is the point
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffe\uffff]/g;

/** Joins two lines, repairing a word broken by a line-end hyphen. */
export function joinLines(left: string, right: string): string {
  const l = left.trimEnd();
  const r = right.trimStart();
  const m = /(\p{L}+)[-\u00ad]$/u.exec(l);
  if (m && /^\p{Ll}/u.test(r)) {
    const keep = KEEP_HYPHEN.test(l.slice(0, -1));
    return keep ? `${l}${r}` : `${l.slice(0, -1)}${r}`;
  }
  return `${l} ${r}`;
}

interface Row extends PdfLine {
  page: number;
  furniture?: Furniture;
}

/** Builds a document from positioned PDF lines. Throws ImportError('scanned') when no page has text. */
export function buildPdfDocument(
  input: readonly PdfPage[],
  meta: Omit<DocumentMeta, 'kind'> & { kind?: DocumentMeta['kind'] },
  outline: readonly PdfOutlineItem[] = [],
): DocumentDraft {
  const pages = input.map((p) => ({
    ...p,
    lines: p.lines.map((l) => ({ ...l, text: cleanPdfText(l.text) })),
  }));
  const textChars = pages.reduce((n, p) => n + p.lines.reduce((m, l) => m + l.text.trim().length, 0), 0);
  if (textChars === 0) throw new ImportError('scanned');

  const furniture = classifyFurniture(pages);
  const rows: Row[] = [];
  pages.forEach((p, pi) =>
    p.lines.forEach((l, li) => {
      if (!l.text.trim()) return;
      const kind = furniture.get(`${pi}:${li}`);
      rows.push(kind ? { ...l, page: pi + 1, furniture: kind } : { ...l, page: pi + 1 });
    }),
  );

  const body = rows.filter((r) => !r.furniture);
  const bodySize = median(body.map((r) => r.size)) || 10;
  const gaps: number[] = [];
  for (let i = 1; i < body.length; i++) {
    const a = body[i - 1];
    const b = body[i];
    if (a && b && a.page === b.page && b.y > a.y) gaps.push(b.y - a.y);
  }
  const lineGap = median(gaps) || bodySize * 1.2;
  const columnWidth = median(body.map((r) => r.width));
  const exactSizes = body.filter((r) => Math.abs(r.size - bodySize) <= 0.3).length >= body.length * 0.8;
  // Where a line's column starts: the smallest line start that recurs in the document (a column's edge, seen
  // on many lines) within an indent's reach to its left. A one-off start (a navigation line, a centred word)
  // never counts, so it can't make every ordinary line look indented.
  const startCounts = new Map<number, number>();
  for (const r of body) startCounts.set(Math.round(r.x), (startCounts.get(Math.round(r.x)) ?? 0) + 1);
  const recurring = [...startCounts]
    .filter(([, n]) => n >= Math.max(3, body.length * 0.05))
    .map(([x]) => x)
    .sort((a, b) => a - b);
  const columnLeft = (r: Row) => {
    const x = Math.round(r.x);
    return recurring.find((s) => s <= x && s >= x - columnWidth * 0.3) ?? x;
  };

  const headingSizes = [
    ...new Set(body.filter((r) => r.size >= bodySize * 1.18).map((r) => Math.round(r.size))),
  ].sort((a, b) => b - a);
  const headingLevel = (size: number) => Math.min(6, headingSizes.indexOf(Math.round(size)) + 1);

  const blocks: Block[] = [];
  let current: { text: string; page: number; size: number; heading: boolean } | null = null;
  let prev: Row | null = null;
  // Furniture found inside a paragraph (a page number, the next page's header, a footnote) waits until the
  // paragraph ends, so a sentence that runs over a page stays one sentence.
  const held: Block[] = [];

  const flush = () => {
    if (!current) return;
    const text = current.text.replace(/\s+/g, ' ').trim();
    if (text) {
      blocks.push(
        current.heading
          ? { kind: 'heading', text, level: headingLevel(current.size), skips: [], page: current.page }
          : { kind: 'paragraph', text, skips: [], page: current.page },
      );
    }
    current = null;
    blocks.push(...held.splice(0));
  };

  for (const r of rows) {
    if (r.furniture) {
      const text = r.text.replace(/\s+/g, ' ').trim();
      const skip: Skip = { start: 0, end: text.length, reason: r.furniture };
      held.push({ kind: 'paragraph', text, skips: [skip], page: r.page });
      if (!current) blocks.push(...held.splice(0));
      continue;
    }
    const isHeading = r.size >= bodySize * 1.18 && r.text.length < 140 && !/[.;,]$/.test(r.text.trim());
    const indent = r.x - columnLeft(r);
    const endsSentence = prev ? /[.!?:”"’)।॥]$/u.test(prev.text.trim()) : true;
    const nextColumn =
      !!prev && prev.page === r.page && r.y < prev.y - lineGap * 0.5 && r.x > prev.x + columnWidth * 0.5;
    const startsNew =
      !current ||
      !prev ||
      current.heading !== isHeading ||
      (isHeading && Math.abs(r.size - current.size) > 0.5) ||
      // A byline, caption or pull quote set at another size than the text around it (only where sizes are
      // exact: OCR guesses a size per line, 15-19 pt for one body text).
      (exactSizes && !isHeading && Math.abs(r.size - prev.size) > bodySize * 0.08) ||
      (prev.page === r.page && r.y - prev.y > lineGap * 1.35) ||
      // The next column continues the paragraph unless the last one ended a sentence there.
      (nextColumn && (endsSentence || indent > bodySize * 0.5)) ||
      (!isHeading && indent > bodySize * 0.5 && indent < columnWidth * 0.3) || // first-line indent
      // A short line ending a sentence ends its paragraph (। and ॥ end sentences in Devanagari).
      (!isHeading && endsSentence && prev.width < columnWidth * 0.8);
    if (startsNew) {
      flush();
      current = { text: r.text, page: r.page, size: r.size, heading: isHeading };
    } else if (current) {
      current.text = joinLines(current.text, r.text);
    }
    prev = r;
  }
  flush();

  if (!blocks.some((b) => b.skips.length === 0)) throw new ImportError('empty');

  const chapters = chaptersFor(blocks, outline);
  return {
    meta: { ...meta, kind: meta.kind ?? (pages.length > 60 ? 'book' : 'document') },
    chapters,
    blocks,
  };
}

function chaptersFor(blocks: readonly Block[], outline: readonly PdfOutlineItem[]): Chapter[] {
  const top = outline.filter((o) => o.level === Math.min(...outline.map((x) => x.level)));
  if (top.length >= 2) {
    const chapters: Chapter[] = [];
    for (const o of top) {
      const firstOnPage = blocks.findIndex((b) => (b.page ?? 0) >= o.page && b.skips.length === 0);
      if (firstOnPage < 0) continue;
      const titleMatch = blocks.findIndex(
        (b, i) =>
          i >= firstOnPage &&
          (b.page ?? 0) === o.page &&
          b.text.toLowerCase().includes(o.title.toLowerCase()),
      );
      const blockStart = titleMatch >= 0 ? titleMatch : firstOnPage;
      if (chapters.length && (chapters[chapters.length - 1]?.blockStart ?? 0) >= blockStart) continue;
      chapters.push({ title: o.title.trim(), level: 1, blockStart });
    }
    if (chapters.length) {
      const first = chapters[0];
      if (first && first.blockStart > 0) first.blockStart = 0;
      return chapters;
    }
  }
  // The biggest heading size that repeats: a book's title is often the only level-1 heading, with its
  // chapters one size down (which used to leave the whole book as one chapter).
  const all = blocks.map((b, i) => ({ b, i })).filter(({ b }) => b.kind === 'heading');
  const level = [1, 2, 3, 4, 5, 6].find((l) => all.filter(({ b }) => b.level === l).length >= 2);
  const heads = all.filter(({ b }) => b.level === level);
  if (heads.length >= 2) {
    return heads.map(({ b, i }, k) => ({ title: b.text, level: 1, blockStart: k === 0 ? 0 : i }));
  }
  return [{ title: '', level: 1, blockStart: 0 }];
}
