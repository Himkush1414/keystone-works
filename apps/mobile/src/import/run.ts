import { ImportError, prepareDocument } from '@lamplight/core';
import type { Db } from '../data/db';
import { createDocument, findBySha, markFailed, saveContent, type DocumentSource } from '../data/library';
import { detectFormat } from './format';
import { parseImport, titleFromName, type ParseDeps } from './parse';

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
}

export interface ImportDeps extends ParseDeps {
  sha256(bytes: Uint8Array): Promise<string>;
  /** Stores an EPUB cover image and returns its path. */
  saveCover?(documentId: string, cover: { mime: string; data: Uint8Array }): Promise<string>;
  now?(): number;
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
 * shortcut: parsing and preparation run on the JS thread; move to a worker when books over ~5 MB stall the UI.
 */
export async function importFile(db: Db, file: ImportFile, deps: ImportDeps): Promise<ImportResult> {
  let format;
  try {
    format = detectFormat(file);
  } catch (e) {
    if (e instanceof ImportError) return { status: 'failed', id: null, code: e.code };
    throw e;
  }

  const sha256 = await deps.sha256(file.bytes);
  const existing = findBySha(db, sha256);
  if (existing && existing.status !== 'failed') return { status: 'duplicate', id: existing.id };
  const id =
    existing?.id ??
    createDocument(
      db,
      {
        kind: format === 'epub' ? 'book' : 'document',
        title: titleFromName(file.name),
        source: file.source,
        ...(file.uri ? { sourceUri: file.uri } : {}),
        sha256,
        byteSize: file.bytes.length,
      },
      deps.now?.() ?? Date.now(),
    );

  try {
    const draft = await parseImport(
      {
        format,
        name: file.name,
        bytes: file.bytes,
        ...(file.path ? { path: file.path } : {}),
        ...(file.password ? { password: file.password } : {}),
      },
      deps,
    );
    const prepared = prepareDocument(draft, { fromPdf: format === 'pdf' });
    const cover = draft.meta.cover && deps.saveCover ? await deps.saveCover(id, draft.meta.cover) : undefined;
    saveContent(db, id, prepared, cover ? { coverPath: cover } : {});
    return { status: 'ready', id };
  } catch (e) {
    const code = e instanceof ImportError ? e.code : 'corrupt';
    markFailed(db, id, code);
    return { status: 'failed', id, code };
  }
}
