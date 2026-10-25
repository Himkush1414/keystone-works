import type { Block, Chapter, Character, DocumentKind, PreparedDocument, Sentence } from '@lamplight/core';
import type { Db } from './db';
import { newId } from './ids';

export type DocumentSource = 'file' | 'share' | 'url' | 'paste' | 'sample';
export type DocumentStatus = 'importing' | 'ready' | 'failed';

export interface DocumentSettings {
  voice?: string;
  quality?: 'live' | 'studio' | 'studioPlus' | 'auto';
  castMode?: 'off' | 'dialogue' | 'full';
  clean?: Partial<Record<string, boolean>>;
  customSkips?: string[];
  speed?: number;
}

/**
 * The importer's version, stored with each document's text. Raise it when a fix changes the text an import
 * produces: a file opened again with an older version's text is then imported afresh, in place.
 * 1: Hindi PDFs read through ActualText (#64), no more paragraphs cut at the first unmapped glyph.
 */
export const IMPORT_VERSION = 1;

export interface LibraryItem {
  id: string;
  kind: DocumentKind;
  title: string;
  author: string | null;
  source: DocumentSource;
  sourceUri: string | null;
  siteName: string | null;
  language: string;
  coverPath: string | null;
  status: DocumentStatus;
  errorCode: string | null;
  wordCount: number;
  sentenceCount: number;
  /** A PDF still being read: its first pages are ready to play, the rest are coming. */
  loading: { pages: number; of: number } | null;
  /** The [IMPORT_VERSION] that made the stored text (0: older than the record). */
  importVersion: number;
  settings: DocumentSettings;
  addedAt: number;
  openedAt: number | null;
  finishedAt: number | null;
  /** From positions: 0..1 */
  progress: number;
  sentenceOrd: number;
  listenedMs: number;
}

interface DocumentRow {
  id: string;
  kind: DocumentKind;
  title: string;
  author: string | null;
  source: DocumentSource;
  source_uri: string | null;
  site_name: string | null;
  language: string;
  cover_path: string | null;
  status: DocumentStatus;
  error_code: string | null;
  word_count: number;
  sentence_count: number;
  pages_loaded: number | null;
  pages_total: number | null;
  import_version: number | null;
  settings_json: string;
  added_at: number;
  opened_at: number | null;
  finished_at: number | null;
  progress: number | null;
  sentence_ord: number | null;
  listened_ms: number | null;
}

const SELECT_ITEM = `
  SELECT d.*, p.progress, p.sentence_ord, p.listened_ms
  FROM documents d LEFT JOIN positions p ON p.document_id = d.id
  WHERE d.deleted_at IS NULL`;

function parseSettings(json: string): DocumentSettings {
  try {
    const v = JSON.parse(json) as unknown;
    return v && typeof v === 'object' ? (v as DocumentSettings) : {};
  } catch {
    return {};
  }
}

const toItem = (r: DocumentRow): LibraryItem => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  author: r.author,
  source: r.source,
  sourceUri: r.source_uri,
  siteName: r.site_name,
  language: r.language,
  coverPath: r.cover_path,
  status: r.status,
  errorCode: r.error_code,
  wordCount: r.word_count,
  sentenceCount: r.sentence_count,
  loading:
    r.pages_loaded !== null && r.pages_total !== null ? { pages: r.pages_loaded, of: r.pages_total } : null,
  importVersion: r.import_version ?? 0,
  settings: parseSettings(r.settings_json),
  addedAt: r.added_at,
  openedAt: r.opened_at,
  finishedAt: r.finished_at,
  progress: r.progress ?? 0,
  sentenceOrd: r.sentence_ord ?? 0,
  listenedMs: r.listened_ms ?? 0,
});

export type Shelf = 'all' | 'books' | 'documents' | 'articles';
export type SortKey = 'recent' | 'added' | 'title' | 'author' | 'progress';
export type StatusFilter = 'all' | 'new' | 'inProgress' | 'finished';

const SHELF_KINDS: Record<Shelf, DocumentKind[] | null> = {
  all: null,
  books: ['book'],
  documents: ['document', 'note'],
  articles: ['article'],
};

const ORDER: Record<SortKey, string> = {
  recent: 'coalesce(d.opened_at, d.added_at) DESC',
  added: 'd.added_at DESC',
  title: 'd.title COLLATE NOCASE ASC',
  author: "coalesce(d.author, '') COLLATE NOCASE ASC, d.title COLLATE NOCASE ASC",
  progress: 'coalesce(p.progress, 0) DESC',
};

export function createDocument(
  db: Db,
  input: {
    kind: DocumentKind;
    title: string;
    source: DocumentSource;
    sourceUri?: string;
    sha256?: string;
    byteSize?: number;
  },
  now = Date.now(),
): string {
  const id = newId(now);
  db.run(
    `INSERT INTO documents (id, kind, title, source, source_uri, sha256, byte_size, status, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'importing', ?)`,
    [
      id,
      input.kind,
      input.title,
      input.source,
      input.sourceUri ?? null,
      input.sha256 ?? null,
      input.byteSize ?? null,
      now,
    ],
  );
  return id;
}

export function findBySha(db: Db, sha256: string): LibraryItem | undefined {
  const r = db.get<DocumentRow>(`${SELECT_ITEM} AND d.sha256 = ?`, [sha256]);
  return r ? toItem(r) : undefined;
}

export function getItem(db: Db, id: string): LibraryItem | undefined {
  const r = db.get<DocumentRow>(`${SELECT_ITEM} AND d.id = ?`, [id]);
  return r ? toItem(r) : undefined;
}

export function listItems(
  db: Db,
  shelf: Shelf = 'all',
  sort: SortKey = 'recent',
  status: StatusFilter = 'all',
): LibraryItem[] {
  const where: string[] = [];
  const params: string[] = [];
  const kinds = SHELF_KINDS[shelf];
  if (kinds) {
    where.push(`d.kind IN (${kinds.map(() => '?').join(', ')})`);
    params.push(...kinds);
  }
  if (status === 'new') where.push('coalesce(p.progress, 0) = 0 AND d.finished_at IS NULL');
  if (status === 'inProgress') where.push('coalesce(p.progress, 0) > 0 AND d.finished_at IS NULL');
  if (status === 'finished') where.push('d.finished_at IS NOT NULL');
  const sql = `${SELECT_ITEM}${where.length ? ` AND ${where.join(' AND ')}` : ''} ORDER BY ${ORDER[sort]}`;
  return db.all<DocumentRow>(sql, params).map(toItem);
}

/** The item to offer on the Continue card: most recently opened, ready and unfinished. */
export function continueItem(db: Db): LibraryItem | undefined {
  const r = db.get<DocumentRow>(
    `${SELECT_ITEM} AND d.status = 'ready' AND d.finished_at IS NULL AND d.opened_at IS NOT NULL ORDER BY d.opened_at DESC LIMIT 1`,
  );
  return r ? toItem(r) : undefined;
}

/** Saves an imported document's content and metadata in one transaction and marks it ready. */
export function saveContent(
  db: Db,
  id: string,
  doc: PreparedDocument,
  extra: { coverPath?: string; loading?: { pages: number; of: number } } = {},
): void {
  const { draft, sentences } = doc;
  db.transaction(() => {
    db.run('DELETE FROM blocks WHERE document_id = ?', [id]);
    db.run('DELETE FROM sentences WHERE document_id = ?', [id]);
    db.run('DELETE FROM chapters WHERE document_id = ?', [id]);
    db.run('DELETE FROM characters WHERE document_id = ?', [id]);
    db.run('DELETE FROM blocks_fts WHERE document_id = ?', [id]);
    draft.blocks.forEach((b: Block, ord: number) => {
      db.run(
        'INSERT INTO blocks (document_id, ord, kind, level, page, text, skips_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          id,
          ord,
          b.kind,
          b.level ?? null,
          b.page ?? null,
          b.text,
          b.skips.length ? JSON.stringify(b.skips.map((s) => [s.start, s.end, s.reason])) : null,
        ],
      );
      if (b.kind !== 'code' && b.text.trim()) {
        db.run('INSERT INTO blocks_fts (text, document_id, ord) VALUES (?, ?, ?)', [b.text, id, ord]);
      }
    });
    sentences.forEach((s: Sentence, ord: number) => {
      db.run(
        'INSERT INTO sentences (document_id, ord, block_ord, start, end, kind, speaker_id, confidence, pause_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, ord, s.block, s.start, s.end, s.kind, s.speaker ?? null, doc.confidence[ord] ?? 0, s.pauseMs],
      );
    });
    draft.chapters.forEach((c: Chapter, ord: number) => {
      const first = sentences.findIndex((s) => s.block >= c.blockStart);
      db.run(
        'INSERT INTO chapters (document_id, ord, title, level, language, block_start, first_sentence) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, ord, c.title, c.level, c.language ?? null, c.blockStart, first < 0 ? sentences.length : first],
      );
    });
    doc.characters.forEach((c: Character) => {
      db.run(
        'INSERT INTO characters (document_id, id, name, aliases_json, gender, line_count, age, temperament) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          id,
          c.id,
          c.name,
          JSON.stringify(c.aliases),
          c.gender ?? null,
          c.lines,
          c.age ?? null,
          c.temperament ?? null,
        ],
      );
    });
    db.run(
      `UPDATE documents SET kind = ?, title = ?, author = ?, site_name = ?, published_at = ?, language = ?, cover_path = coalesce(?, cover_path),
         word_count = ?, sentence_count = ?, status = 'ready', error_code = NULL, pages_loaded = ?, pages_total = ?,
         import_version = ${IMPORT_VERSION}
       WHERE id = ?`,
      [
        draft.meta.kind,
        draft.meta.title,
        draft.meta.author ?? null,
        draft.meta.siteName ?? null,
        draft.meta.publishedAt ?? null,
        doc.language,
        extra.coverPath ?? null,
        doc.wordCount,
        sentences.length,
        extra.loading?.pages ?? null,
        extra.loading?.of ?? null,
        id,
      ],
    );
  });
}

/** How far a PDF still being read has got (the library shows it). */
export function setPagesLoaded(db: Db, id: string, pages: number, of: number): void {
  db.run('UPDATE documents SET pages_loaded = ?, pages_total = ? WHERE id = ?', [pages, of, id]);
}

export function markFailed(db: Db, id: string, code: string): void {
  db.run(
    "UPDATE documents SET status = 'failed', error_code = ?, pages_loaded = NULL, pages_total = NULL WHERE id = ?",
    [code, id],
  );
}

export function markOpened(db: Db, id: string, now = Date.now()): void {
  db.run('UPDATE documents SET opened_at = ? WHERE id = ?', [now, id]);
}

export function setFinished(db: Db, id: string, finished: boolean, now = Date.now()): void {
  db.run('UPDATE documents SET finished_at = ? WHERE id = ?', [finished ? now : null, id]);
}

export function updateDetails(db: Db, id: string, details: { title?: string; author?: string | null }): void {
  const item = getItem(db, id);
  if (!item) return;
  db.run('UPDATE documents SET title = ?, author = ? WHERE id = ?', [
    details.title?.trim() || item.title,
    details.author === undefined ? item.author : details.author?.trim() || null,
    id,
  ]);
}

export function updateSettings(db: Db, id: string, patch: DocumentSettings): DocumentSettings {
  const current = getItem(db, id)?.settings ?? {};
  const next = { ...current, ...patch };
  db.run('UPDATE documents SET settings_json = ? WHERE id = ?', [JSON.stringify(next), id]);
  return next;
}

/** Soft delete (for the undo window). */
export function softDelete(db: Db, id: string, now = Date.now()): void {
  db.run('UPDATE documents SET deleted_at = ? WHERE id = ?', [now, id]);
}

export function restore(db: Db, id: string): void {
  db.run('UPDATE documents SET deleted_at = NULL WHERE id = ?', [id]);
}

/** Permanently removes soft-deleted documents older than `before`; returns their ids (for file cleanup). */
export function purgeDeleted(db: Db, before: number): string[] {
  const ids = db
    .all<{ id: string }>('SELECT id FROM documents WHERE deleted_at IS NOT NULL AND deleted_at <= ?', [
      before,
    ])
    .map((r) => r.id);
  db.transaction(() => {
    for (const id of ids) {
      db.run('DELETE FROM blocks_fts WHERE document_id = ?', [id]);
      db.run('DELETE FROM documents WHERE id = ?', [id]);
    }
  });
  return ids;
}

export interface SearchHit {
  documentId: string;
  title: string;
  author: string | null;
  kind: DocumentKind;
  /** Block that matched (body hits only). */
  blockOrd?: number;
  snippet?: string;
}

/** Turns user input into a safe FTS5 prefix query: every word must appear. */
export function ftsQuery(input: string): string | null {
  const words = input
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((w) => w.length > 0)
    .slice(0, 8);
  if (!words?.length) return null;
  return words.map((w) => `"${w}"*`).join(' ');
}

export function search(db: Db, input: string, limit = 30): { titles: SearchHit[]; body: SearchHit[] } {
  const q = ftsQuery(input);
  if (!q) return { titles: [], body: [] };
  const titles = db
    .all<{ id: string; title: string; author: string | null; kind: DocumentKind }>(
      `SELECT d.id, d.title, d.author, d.kind FROM documents_fts f JOIN documents d ON d.rowid = f.rowid
       WHERE documents_fts MATCH ? AND d.deleted_at IS NULL ORDER BY rank LIMIT ?`,
      [q, limit],
    )
    .map((r) => ({ documentId: r.id, title: r.title, author: r.author, kind: r.kind }));
  const body = db
    .all<{
      document_id: string;
      ord: number;
      snippet: string;
      title: string;
      author: string | null;
      kind: DocumentKind;
    }>(
      `SELECT b.document_id, b.ord, snippet(blocks_fts, 0, '\u0002', '\u0003', '…', 12) AS snippet, d.title, d.author, d.kind
       FROM blocks_fts b JOIN documents d ON d.id = b.document_id
       WHERE blocks_fts MATCH ? AND d.deleted_at IS NULL ORDER BY rank LIMIT ?`,
      [q, limit],
    )
    .map((r) => ({
      documentId: r.document_id,
      title: r.title,
      author: r.author,
      kind: r.kind,
      blockOrd: r.ord,
      snippet: r.snippet,
    }));
  return { titles, body };
}
