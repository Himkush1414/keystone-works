import {
  buildPdfDocument,
  decodeText,
  domToBlocks,
  htmlInfo,
  ImportError,
  parseDocx,
  parseEpub,
  parseHtml,
  parseMarkdown,
  parsePlainText,
  type DocumentDraft,
  type DocumentKind,
  type PdfOutlineItem,
  type PdfPage,
} from '@lamplight/core';
import type { ImportFormat } from './format';

export interface ParseInput {
  format: ImportFormat;
  /** File name as the user saw it; gives the title when the file has none. */
  name: string;
  /** A title the user chose (pasted text); wins over the file name. */
  title?: string;
  /** Overrides what the parser decides (a bundled sample is a book, so Cast runs). */
  kind?: DocumentKind;
  author?: string;
  bytes: Uint8Array;
  /** Local copy of the file; PDF text is extracted natively from a path. */
  path?: string;
  password?: string;
}

/** An open PDF, read a few pages at a time (LamplightEngine.openPdf / pdfPages / closePdf on a device). */
export interface PdfInfo {
  handle: number;
  pageCount: number;
  outline: PdfOutlineItem[];
  title: string | null;
  author: string | null;
}

export interface PdfReader {
  /** Rejects with code "password" or "corrupt". */
  open(path: string, password: string | null): Promise<PdfInfo>;
  /** Pages `from`..`to`, 1-based and inclusive. */
  pages(handle: number, from: number, to: number): Promise<PdfPage[]>;
  close(handle: number): Promise<void>;
}

export interface ParseDeps {
  pdf: PdfReader;
}

/** "my_paper-final.v2.pdf" → "my paper final.v2". */
export function titleFromName(name: string): string {
  const base = name
    .replace(/^.*[\\/]/, '')
    .replace(/\.[a-z0-9]{1,8}$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base || 'Untitled';
}

/** Runs the core parser for `format`. Errors are ImportError with a code the UI explains. */
export async function parseImport(input: ParseInput, deps: ParseDeps): Promise<DocumentDraft> {
  const draft = await parseFormat(input, deps);
  if (!input.kind && !input.author) return draft;
  return {
    ...draft,
    meta: {
      ...draft.meta,
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.author ? { author: input.author } : {}),
    },
  };
}

async function parseFormat(input: ParseInput, deps: ParseDeps): Promise<DocumentDraft> {
  const title = input.title?.trim() || titleFromName(input.name);
  switch (input.format) {
    case 'epub':
      return parseEpub(input.bytes, title);
    case 'docx':
      return parseDocx(input.bytes, title);
    case 'markdown':
      return parseMarkdown(decodeText(input.bytes), title);
    case 'text':
      return parsePlainText(decodeText(input.bytes), title);
    case 'html':
      return htmlDocument(decodeText(input.bytes), title);
    case 'pdf':
      return pdfDocument(input, title, deps);
  }
}

/** A saved web page or HTML file: the whole body is the user's document, so nothing is dropped as clutter. */
function htmlDocument(html: string, fallbackTitle: string): DocumentDraft {
  const doc = parseHtml(html);
  const info = htmlInfo(doc);
  const blocks = domToBlocks(doc, { keepBoilerplate: true, dropNegative: false });
  if (!blocks.some((b) => b.text.trim())) throw new ImportError('empty');
  const title = info.title ?? fallbackTitle;
  return {
    meta: { ...info, title, kind: 'document' },
    chapters: [{ title, level: 1, blockStart: 0 }],
    blocks,
  };
}

/** PDF title metadata is often the authoring tool's file name ("Microsoft Word - draft3.docx"). */
export function usablePdfTitle(raw: string | null | undefined): string | undefined {
  const t = raw?.replace(/\s+/g, ' ').trim();
  if (!t || t.length < 2) return undefined;
  if (/^(microsoft (word|powerpoint) - |untitled\b)|\.(docx?|pdf|tex|pptx?|odt|rtf|indd)$/i.test(t))
    return undefined;
  return t;
}

/** Pages read before a long PDF is published as playable, and per step after that. */
export const PDF_FIRST_PAGES = 12;
export const PDF_BATCH_PAGES = 40;

/** Opens a PDF, mapping the engine's rejection codes to import errors. */
export async function openPdf(input: ParseInput, deps: ParseDeps): Promise<PdfInfo> {
  if (!input.path) throw new Error('PDF import needs a local file path');
  try {
    return await deps.pdf.open(input.path, input.password ?? null);
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    throw new ImportError(code === 'password' ? 'password' : 'corrupt', String(e));
  }
}

/** Title, author and kind for a PDF, from its metadata and length. */
export function pdfMeta(info: PdfInfo, fallbackTitle: string) {
  return {
    title: usablePdfTitle(info.title) ?? fallbackTitle,
    ...(info.author?.trim() ? { author: info.author.trim() } : {}),
    kind: info.pageCount > 60 ? ('book' as const) : ('document' as const),
  };
}

async function pdfDocument(
  input: ParseInput,
  fallbackTitle: string,
  deps: ParseDeps,
): Promise<DocumentDraft> {
  const info = await openPdf(input, deps);
  try {
    const pages: PdfPage[] = [];
    for (let from = 1; from <= info.pageCount; from += PDF_BATCH_PAGES)
      pages.push(...(await deps.pdf.pages(info.handle, from, from + PDF_BATCH_PAGES - 1)));
    return buildPdfDocument(pages, pdfMeta(info, fallbackTitle), info.outline);
  } finally {
    await deps.pdf.close(info.handle).catch(() => undefined);
  }
}
