import type { Block, DocumentDraft, Skip } from '../src/model';
import type { PdfPage } from '../src/import/pdf';
import type { LineLabel, MessyBook } from './fixtures/messyPdf';

/** The core functions scored, passed in so the same eval can run against an older build of the package. */
export interface CleanCore {
  buildPdfDocument(pages: readonly PdfPage[], meta: { title: string }): DocumentDraft;
  detectSkips(draft: DocumentDraft, fromPdf?: boolean): DocumentDraft;
  effectiveSkips(block: Block, settings: never): Skip[];
  defaultCleanSettings(kind: DocumentDraft['meta']['kind'], fromPdf: boolean): unknown;
}

export interface CleanScore {
  id: string;
  /** Furniture lines left out of the narration, of all furniture lines, per label. */
  furniture: Partial<Record<LineLabel, { found: number; total: number }>>;
  furnitureRecall: number;
  /** Lines of the book's own text (body and titles) left out of the narration. */
  bodyLinesSkipped: number;
  /** Sentences narrated whole, in one block, exactly as written. */
  sentencesIntact: number;
  sentences: number;
  /** Paragraphs narrated as exactly one block. */
  paragraphsIntact: number;
  paragraphs: number;
}

const squash = (s: string) => s.replace(/\s+/g, '');

function occurrences(text: string, part: string): number {
  let n = 0;
  for (let at = text.indexOf(part); at >= 0; at = text.indexOf(part, at + part.length)) n++;
  return n;
}

/** How many of `wanted` (with repeats) are heard intact, counting each heard copy once. */
function matched(wanted: readonly string[], heardCount: (squashed: string) => number): number {
  const need = new Map<string, number>();
  for (const w of wanted) need.set(squash(w), (need.get(squash(w)) ?? 0) + 1);
  let n = 0;
  for (const [w, k] of need) n += Math.min(k, heardCount(w));
  return n;
}

/** What the listener hears from a block: its text with the active skips cut out. */
function spoken(core: CleanCore, block: Block, settings: unknown): string {
  let out = '';
  let at = 0;
  for (const s of core.effectiveSkips(block, settings as never)) {
    out += block.text.slice(at, s.start);
    at = s.end;
  }
  return out + block.text.slice(at);
}

export function scoreBook(core: CleanCore, book: MessyBook): CleanScore {
  const draft = core.detectSkips(core.buildPdfDocument(book.pages, { title: book.id }), true);
  const settings = core.defaultCleanSettings(draft.meta.kind, true);
  const heard = draft.blocks.map((b) => squash(spoken(core, b, settings))).filter(Boolean);
  const all = heard.join('\u0001');
  // A block skipped whole, by page: what Clean Read took out as a line of its own.
  const skipped = new Map<number, string[]>();
  for (const b of draft.blocks) {
    if (squash(spoken(core, b, settings))) continue;
    const list = skipped.get(b.page ?? 0) ?? [];
    list.push(squash(b.text));
    skipped.set(b.page ?? 0, list);
  }

  const furniture: CleanScore['furniture'] = {};
  let bodyLinesSkipped = 0;
  book.pages.forEach((p, pi) =>
    p.lines.forEach((l, li) => {
      const label = book.labels[pi]?.[li] ?? 'body';
      const text = squash(l.text);
      const gone = (skipped.get(pi + 1) ?? []).includes(text) || !all.includes(text);
      if (label === 'body' || label === 'title') {
        if ((skipped.get(pi + 1) ?? []).includes(text)) bodyLinesSkipped++;
        return;
      }
      const f = (furniture[label] ??= { found: 0, total: 0 });
      f.total++;
      if (gone) f.found++;
    }),
  );
  const totals = Object.values(furniture);
  const found = totals.reduce((n, f) => n + f.found, 0);
  const total = totals.reduce((n, f) => n + f.total, 0);

  return {
    id: book.id,
    furniture,
    furnitureRecall: total ? found / total : 1,
    bodyLinesSkipped,
    sentencesIntact: matched(book.sentences, (s) => heard.reduce((n, h) => n + occurrences(h, s), 0)),
    sentences: book.sentences.length,
    paragraphsIntact: matched(book.paragraphs, (p) => heard.filter((h) => h === p).length),
    paragraphs: book.paragraphs.length,
  };
}

const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;

export function formatScore(s: CleanScore): string {
  const rows = Object.entries(s.furniture).map(([k, f]) => `    ${k}: ${f.found}/${f.total}`);
  return [
    `${s.id}`,
    `  furniture left out: ${pct(s.furnitureRecall, 1)}`,
    ...rows,
    `  body lines wrongly skipped: ${s.bodyLinesSkipped}`,
    `  sentences narrated whole: ${s.sentencesIntact}/${s.sentences} (${pct(s.sentencesIntact, s.sentences)})`,
    `  paragraphs narrated as one block: ${s.paragraphsIntact}/${s.paragraphs} (${pct(s.paragraphsIntact, s.paragraphs)})`,
  ].join('\n');
}
