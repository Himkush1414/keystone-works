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
} from '@lamplight/core';
import type { PdfExtraction } from '../../modules/lamplight-engine/src/types';
import type { ImportFormat } from './format';

export interface ParseInput {
  format: ImportFormat;
  /** File name as the user saw it; gives the title when the file has none. */
  name: string;
  bytes: Uint8Array;
  /** Local copy of the file; PDF text is extracted natively from a path. */
  path?: string;
  password?: string;
}

export interface ParseDeps {
  /** LamplightEngine.extractPdf: JSON text, rejects with code "password" or "corrupt". */
  extractPdf(path: string, password: string | null): Promise<string>;
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
  const title = titleFromName(input.name);
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

async function pdfDocument(
  input: ParseInput,
  fallbackTitle: string,
  deps: ParseDeps,
): Promise<DocumentDraft> {
  if (!input.path) throw new Error('PDF import needs a local file path');
  let json: string;
  try {
    json = await deps.extractPdf(input.path, input.password ?? null);
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    throw new ImportError(code === 'password' ? 'password' : 'corrupt', String(e));
  }
  let pdf: PdfExtraction;
  try {
    pdf = JSON.parse(json) as PdfExtraction;
  } catch {
    throw new ImportError('corrupt');
  }
  const title = usablePdfTitle(pdf.title) ?? fallbackTitle;
  return buildPdfDocument(
    pdf.pages,
    { title, ...(pdf.author?.trim() ? { author: pdf.author.trim() } : {}) },
    pdf.outline,
  );
}
