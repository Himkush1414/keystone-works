import {
  ImportError,
  type Block,
  type Chapter,
  type DocumentDraft,
  type DocumentMeta,
  type Skip,
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

const normalizeEdge = (s: string) => s.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
const isPageNumber = (s: string) =>
  /^(?:page|seite|página|pagina|p\.)?\s*\d{1,4}(?:\s*(?:of|von|de|di|\/)\s*\d{1,4})?$/iu.test(s.trim()) ||
  /^[ivxlcdm]{1,7}$/iu.test(s.trim()) ||
  /^[-–—]\s*\d{1,4}\s*[-–—]$/u.test(s.trim());

function median(values: number[]): number {
  if (!values.length) return 0;
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? (v[m] ?? 0) : ((v[m - 1] ?? 0) + (v[m] ?? 0)) / 2;
}

type EdgeKind = 'header' | 'footer' | 'pageNumber';

/** Finds running headers/footers (text repeated near the same edge on many pages) and page numbers. */
export function classifyEdges(pages: readonly PdfPage[]): Map<string, EdgeKind> {
  const result = new Map<string, EdgeKind>(); // key: `${page}:${lineIndex}`
  const counts = new Map<string, number>();
  const candidates: { key: string; norm: string; top: boolean; text: string }[] = [];
  pages.forEach((p, pi) => {
    p.lines.forEach((l, li) => {
      const top = l.y < p.height * EDGE;
      const bottom = l.y > p.height * (1 - EDGE);
      if (!top && !bottom) return;
      const key = `${pi}:${li}`;
      if (isPageNumber(l.text)) {
        result.set(key, 'pageNumber');
        return;
      }
      const norm = `${top ? 'T' : 'B'}|${normalizeEdge(l.text)}`;
      candidates.push({ key, norm, top, text: l.text });
      counts.set(norm, (counts.get(norm) ?? 0) + 1);
    });
  });
  const threshold = Math.max(2, Math.ceil(pages.length * 0.3));
  for (const c of candidates) {
    if ((counts.get(c.norm) ?? 0) >= threshold) result.set(c.key, c.top ? 'header' : 'footer');
  }
  return result;
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
  edge?: EdgeKind;
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

  const edges = classifyEdges(pages);
  const rows: Row[] = [];
  pages.forEach((p, pi) =>
    p.lines.forEach((l, li) => {
      if (!l.text.trim()) return;
      const edge = edges.get(`${pi}:${li}`);
      rows.push(edge ? { ...l, page: pi + 1, edge } : { ...l, page: pi + 1 });
    }),
  );

  const body = rows.filter((r) => !r.edge);
  const bodySize = median(body.map((r) => r.size)) || 10;
  const gaps: number[] = [];
  for (let i = 1; i < body.length; i++) {
    const a = body[i - 1];
    const b = body[i];
    if (a && b && a.page === b.page && b.y > a.y) gaps.push(b.y - a.y);
  }
  const lineGap = median(gaps) || bodySize * 1.2;
  const leftEdge = median(body.map((r) => r.x));
  const columnWidth = median(body.map((r) => r.width));

  const headingSizes = [
    ...new Set(body.filter((r) => r.size >= bodySize * 1.18).map((r) => Math.round(r.size))),
  ].sort((a, b) => b - a);
  const headingLevel = (size: number) => Math.min(6, headingSizes.indexOf(Math.round(size)) + 1);

  const blocks: Block[] = [];
  let current: { text: string; page: number; size: number; heading: boolean } | null = null;
  let prev: Row | null = null;

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
  };

  for (const r of rows) {
    if (r.edge) {
      flush();
      const text = r.text.replace(/\s+/g, ' ').trim();
      const skip: Skip = { start: 0, end: text.length, reason: r.edge };
      blocks.push({ kind: 'paragraph', text, skips: [skip], page: r.page });
      prev = null;
      continue;
    }
    const isHeading = r.size >= bodySize * 1.18 && r.text.length < 140 && !/[.;,]$/.test(r.text.trim());
    const startsNew =
      !current ||
      !prev ||
      current.heading !== isHeading ||
      (isHeading && Math.abs(r.size - current.size) > 0.5) ||
      (prev.page === r.page && r.y - prev.y > lineGap * 1.55) ||
      (prev.page === r.page && r.y < prev.y - lineGap * 0.5 && r.x > prev.x + columnWidth * 0.5) || // next column
      (!isHeading && r.x > leftEdge + bodySize * 1.2 && r.x < leftEdge + columnWidth * 0.3) || // first-line indent
      // A short line ending a sentence ends its paragraph (। and ॥ end sentences in Devanagari).
      (!isHeading && /[.!?:”"’)।॥]$/u.test(prev.text.trim()) && prev.width < columnWidth * 0.8);
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
