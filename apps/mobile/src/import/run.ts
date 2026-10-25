import {
  buildPdfDocument,
  ImportError,
  prepareDocument,
  prepareSteps,
  type DocumentKind,
  type PdfPage,
  type PreparedDocument,
} from '@lamplight/core';
import type { Db } from '../data/db';
import {
  createDocument,
  findBySha,
  IMPORT_VERSION,
  markFailed,
  saveContent,
  setPagesLoaded,
  type DocumentSource,
} from '../data/library';
import { detectFormat } from './format';
import {
  openPdf,
  parseImport,
  PDF_BATCH_PAGES,
  PDF_FIRST_PAGES,
  pdfMeta,
  titleFromName,
  type ParseDeps,
  type PdfInfo,
} from './parse';

export interface ImportFile {
  name: string;
  mime?: string | null;
  bytes: Uint8Array;
  /** Local copy (needed for PDFs). */
  path?: string;
  /** Where the user got it (content URI or URL), kept for "Open source". */
  uri?: string;
  source: DocumentSource;
  password?: string;
  /** Title chosen by the user (pasted text); otherwise it comes from the file. */
  title?: string;
  /** Known up front for bundled content; otherwise the parser decides. */
  kind?: DocumentKind;
  author?: string;
}

export interface ImportDeps extends ParseDeps {
  /** Hex SHA-256 of the file's content; on devices expo-file-system's File.digest hashes the local copy. */
  sha256(file: ImportFile): Promise<string>;
  /** Stores an EPUB cover image and returns its path. */
  saveCover?(documentId: string, cover: { mime: string; data: Uint8Array }): Promise<string>;
  now?(): number;
  /**
   * The library changed for `id`: it appeared, more of a PDF was read, or its content was replaced by the
   * whole book (`replaced`).
   */
  onUpdate?(id: string, replaced: boolean): void;
  /** Lets the screen draw between steps of a long import. */
  yieldToUi?(): Promise<void>;
  /** Work that goes on after importFile returns (the rest of a long PDF); tests await it. */
  background?(task: Promise<void>): void;
}

export type ImportResult =
  | { status: 'ready'; id: string }
  | { status: 'duplicate'; id: string }
  | { status: 'failed'; id: string | null; code: ImportError['code'] };

/**
 * Adds a file to the library: refuses what can't be read, finds duplicates by content, shows the item at
 * once in the "importing" state, then parses and prepares it. A failure leaves a failed item with its error
 * code, and importing the same file again retries that item instead of reporting a duplicate.
 *
 * A PDF is read a few pages at a time on the engine's background thread: its first pages become playable at
 * once and the rest arrive while the listener is already listening (see importPdf).
 */
export async function importFile(db: Db, file: ImportFile, deps: ImportDeps): Promise<ImportResult> {
  let format;
  try {
    format = detectFormat(file);
  } catch (e) {
    if (e instanceof ImportError) return { status: 'failed', id: null, code: e.code };
    throw e;
  }

  const sha256 = await deps.sha256(file);
  const existing = findBySha(db, sha256);
  // Text made by an older importer is refreshed in place (same item, its place and settings kept).
  const stale = existing !== undefined && existing.importVersion < IMPORT_VERSION;
  if (existing && existing.status !== 'failed' && !stale) return { status: 'duplicate', id: existing.id };
  const id =
    existing?.id ??
    createDocument(
      db,
      {
        kind: file.kind ?? (format === 'epub' ? 'book' : 'document'),
        title: file.title?.trim() || titleFromName(file.name),
        source: file.source,
        ...(file.uri ? { sourceUri: file.uri } : {}),
        sha256,
        byteSize: file.bytes.length,
      },
      deps.now?.() ?? Date.now(),
    );

  deps.onUpdate?.(id, false);

  if (format === 'pdf') {
    try {
      return await importPdf(db, id, file, deps);
    } catch (e) {
      const code = e instanceof ImportError ? e.code : 'corrupt';
      markFailed(db, id, code);
      deps.onUpdate?.(id, false);
      return { status: 'failed', id, code };
    }
  }

  try {
    const draft = await parseImport(
      {
        format,
        name: file.name,
        bytes: file.bytes,
        ...(file.path ? { path: file.path } : {}),
        ...(file.password ? { password: file.password } : {}),
        ...(file.title ? { title: file.title } : {}),
        ...(file.kind ? { kind: file.kind } : {}),
        ...(file.author ? { author: file.author } : {}),
      },
      deps,
    );
    const prepared = prepareDocument(draft);
    const cover = draft.meta.cover && deps.saveCover ? await deps.saveCover(id, draft.meta.cover) : undefined;
    saveContent(db, id, prepared, cover ? { coverPath: cover } : {});
    return { status: 'ready', id };
  } catch (e) {
    const code = e instanceof ImportError ? e.code : 'corrupt';
    markFailed(db, id, code);
    return { status: 'failed', id, code };
  }
}

const defaultYield = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Runs a stepping computation, letting the screen draw between steps. */
async function stepped<T>(steps: Generator<void, T>, yieldToUi: () => Promise<void>): Promise<T> {
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
    await yieldToUi();
  }
}

const hasText = (pages: readonly PdfPage[]) => pages.some((p) => p.lines.some((l) => l.text.trim()));

/**
 * A PDF in two parts. Its first pages are read, laid out and saved, so the book shows in the library and plays
 * at once; importFile returns then. The rest is read in batches (the library shows how far), then the whole
 * book is laid out (headers and chapters need every page) and replaces the first part. A PDF with no text at
 * all fails as "scanned", so the listener is told instead of finding an empty book.
 */
async function importPdf(db: Db, id: string, file: ImportFile, deps: ImportDeps): Promise<ImportResult> {
  const info = await openPdf(
    {
      format: 'pdf',
      name: file.name,
      bytes: file.bytes,
      ...(file.path ? { path: file.path } : {}),
      ...(file.password ? { password: file.password } : {}),
    },
    deps,
  );
  const meta = pdfMeta(info, file.title?.trim() || titleFromName(file.name));
  const yieldToUi = deps.yieldToUi ?? defaultYield;
  const pages: PdfPage[] = [];
  let read = 0;
  const readTo = async (to: number) => {
    const last = Math.min(info.pageCount, to);
    if (last > read) pages.push(...(await deps.pdf.pages(info.handle, read + 1, last)));
    read = last;
  };

  try {
    await readTo(PDF_FIRST_PAGES);
    // Keep reading while the first pages have no text yet (a cover, a scanned front page).
    while (read < info.pageCount && !hasText(pages)) await readTo(read + PDF_BATCH_PAGES);
    if (read >= info.pageCount) {
      await finishPdf(db, id, info, meta, pages, deps, yieldToUi);
      return { status: 'ready', id };
    }
    const first = buildPdfDocument(
      pages,
      meta,
      info.outline.filter((o) => o.page <= read),
    );
    saveContent(db, id, prepareDocument(first, { fromPdf: true }), {
      loading: { pages: read, of: info.pageCount },
    });
    deps.onUpdate?.(id, false);
  } catch (e) {
    await deps.pdf.close(info.handle).catch(() => undefined);
    throw e;
  }

  const rest = (async () => {
    try {
      while (read < info.pageCount) {
        await yieldToUi();
        await readTo(read + PDF_BATCH_PAGES);
        setPagesLoaded(db, id, read, info.pageCount);
        deps.onUpdate?.(id, false);
      }
      await finishPdf(db, id, info, meta, pages, deps, yieldToUi);
      deps.onUpdate?.(id, true);
    } catch (e) {
      // The first pages stay playable; the rest couldn't be read, so stop saying it's coming.
      console.warn('PDF import stopped after the first pages', e);
      setPagesLoaded(db, id, read, read);
      deps.onUpdate?.(id, false);
    }
  })();
  (deps.background ?? ((task: Promise<void>) => void task.catch(() => undefined)))(rest);
  return { status: 'ready', id };
}

/** Lays out and prepares the whole PDF (in steps) and saves it as the document's content. */
async function finishPdf(
  db: Db,
  id: string,
  info: PdfInfo,
  meta: ReturnType<typeof pdfMeta>,
  pages: readonly PdfPage[],
  deps: ImportDeps,
  yieldToUi: () => Promise<void>,
): Promise<void> {
  try {
    const draft = buildPdfDocument(pages, meta, info.outline);
    await yieldToUi();
    const prepared: PreparedDocument = await stepped(prepareSteps(draft, { fromPdf: true }), yieldToUi);
    saveContent(db, id, prepared);
  } finally {
    await deps.pdf.close(info.handle).catch(() => undefined);
  }
}
