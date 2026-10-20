import type { DictionaryRule } from '@lamplight/core';
import type { Db } from './db';
import { newId } from './ids';

// ── Positions ──

export interface Position {
  sentenceOrd: number;
  offsetMs: number;
  progress: number;
  listenedMs: number;
  updatedAt: number;
}

export function getPosition(db: Db, documentId: string): Position | undefined {
  const r = db.get<{
    sentence_ord: number;
    offset_ms: number;
    progress: number;
    listened_ms: number;
    updated_at: number;
  }>(
    'SELECT sentence_ord, offset_ms, progress, listened_ms, updated_at FROM positions WHERE document_id = ?',
    [documentId],
  );
  return r
    ? {
        sentenceOrd: r.sentence_ord,
        offsetMs: r.offset_ms,
        progress: r.progress,
        listenedMs: r.listened_ms,
        updatedAt: r.updated_at,
      }
    : undefined;
}

/** Records the listening position; `listenedDeltaMs` adds to the item's and today's listening time. */
export function savePosition(
  db: Db,
  documentId: string,
  p: { sentenceOrd: number; offsetMs: number; progress: number; listenedDeltaMs?: number },
  now = Date.now(),
): void {
  const delta = Math.max(0, Math.round(p.listenedDeltaMs ?? 0));
  db.transaction(() => {
    db.run(
      `INSERT INTO positions (document_id, sentence_ord, offset_ms, progress, listened_ms, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(document_id) DO UPDATE SET sentence_ord = excluded.sentence_ord, offset_ms = excluded.offset_ms,
         progress = excluded.progress, listened_ms = positions.listened_ms + ?, updated_at = excluded.updated_at`,
      [
        documentId,
        p.sentenceOrd,
        Math.round(p.offsetMs),
        Math.min(1, Math.max(0, p.progress)),
        delta,
        now,
        delta,
      ],
    );
    if (delta > 0) {
      db.run(
        `INSERT INTO listening_days (day, listened_ms) VALUES (?, ?)
         ON CONFLICT(day) DO UPDATE SET listened_ms = listening_days.listened_ms + excluded.listened_ms`,
        [localDay(now), delta],
      );
    }
  });
}

export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Total listening time over the last `days` days including today. */
export function listenedSince(db: Db, days: number, now = Date.now()): number {
  const from = localDay(now - (days - 1) * 86_400_000);
  return (
    db.get<{ total: number | null }>('SELECT sum(listened_ms) AS total FROM listening_days WHERE day >= ?', [
      from,
    ])?.total ?? 0
  );
}

// ── Bookmarks and highlights ──

export interface Bookmark {
  id: string;
  sentenceOrd: number;
  label: string | null;
  createdAt: number;
}

export function addBookmark(
  db: Db,
  documentId: string,
  sentenceOrd: number,
  label?: string,
  now = Date.now(),
): string {
  const id = newId(now);
  db.run('INSERT INTO bookmarks (id, document_id, sentence_ord, label, created_at) VALUES (?, ?, ?, ?, ?)', [
    id,
    documentId,
    sentenceOrd,
    label?.trim() || null,
    now,
  ]);
  return id;
}

export function listBookmarks(db: Db, documentId: string): Bookmark[] {
  return db
    .all<{ id: string; sentence_ord: number; label: string | null; created_at: number }>(
      'SELECT id, sentence_ord, label, created_at FROM bookmarks WHERE document_id = ? ORDER BY sentence_ord',
      [documentId],
    )
    .map((r) => ({ id: r.id, sentenceOrd: r.sentence_ord, label: r.label, createdAt: r.created_at }));
}

export function removeBookmark(db: Db, id: string): void {
  db.run('DELETE FROM bookmarks WHERE id = ?', [id]);
}

export interface Highlight {
  id: string;
  blockOrd: number;
  start: number;
  end: number;
  color: string;
  note: string | null;
  createdAt: number;
}

export function addHighlight(
  db: Db,
  documentId: string,
  h: { blockOrd: number; start: number; end: number; color?: string; note?: string },
  now = Date.now(),
): string {
  if (h.end <= h.start) throw new Error('Highlight must cover at least one character');
  const id = newId(now);
  db.run(
    'INSERT INTO highlights (id, document_id, block_ord, start, end, color, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, documentId, h.blockOrd, h.start, h.end, h.color ?? 'amber', h.note?.trim() || null, now],
  );
  return id;
}

export function listHighlights(db: Db, documentId: string): Highlight[] {
  return db
    .all<{
      id: string;
      block_ord: number;
      start: number;
      end: number;
      color: string;
      note: string | null;
      created_at: number;
    }>(
      'SELECT id, block_ord, start, end, color, note, created_at FROM highlights WHERE document_id = ? ORDER BY block_ord, start',
      [documentId],
    )
    .map((r) => ({
      id: r.id,
      blockOrd: r.block_ord,
      start: r.start,
      end: r.end,
      color: r.color,
      note: r.note,
      createdAt: r.created_at,
    }));
}

export function updateHighlightNote(db: Db, id: string, note: string | null): void {
  db.run('UPDATE highlights SET note = ? WHERE id = ?', [note?.trim() || null, id]);
}

export function removeHighlight(db: Db, id: string): void {
  db.run('DELETE FROM highlights WHERE id = ?', [id]);
}

// ── Collections ──

export interface Collection {
  id: string;
  name: string;
  count: number;
}

export function createCollection(db: Db, name: string, now = Date.now()): string {
  const id = newId(now);
  const ord = (db.get<{ m: number | null }>('SELECT max(ord) AS m FROM collections')?.m ?? -1) + 1;
  db.run('INSERT INTO collections (id, name, ord, created_at) VALUES (?, ?, ?, ?)', [
    id,
    name.trim(),
    ord,
    now,
  ]);
  return id;
}

export function listCollections(db: Db): Collection[] {
  return db.all<Collection>(
    `SELECT c.id, c.name, count(d.id) AS count FROM collections c
     LEFT JOIN collection_items ci ON ci.collection_id = c.id
     LEFT JOIN documents d ON d.id = ci.document_id AND d.deleted_at IS NULL
     GROUP BY c.id ORDER BY c.ord`,
  );
}

export function addToCollection(db: Db, collectionId: string, documentId: string): void {
  const ord =
    (db.get<{ m: number | null }>('SELECT max(ord) AS m FROM collection_items WHERE collection_id = ?', [
      collectionId,
    ])?.m ?? -1) + 1;
  db.run('INSERT OR IGNORE INTO collection_items (collection_id, document_id, ord) VALUES (?, ?, ?)', [
    collectionId,
    documentId,
    ord,
  ]);
}

export function removeFromCollection(db: Db, collectionId: string, documentId: string): void {
  db.run('DELETE FROM collection_items WHERE collection_id = ? AND document_id = ?', [
    collectionId,
    documentId,
  ]);
}

export function collectionDocumentIds(db: Db, collectionId: string): string[] {
  return db
    .all<{ document_id: string }>(
      `SELECT ci.document_id FROM collection_items ci JOIN documents d ON d.id = ci.document_id
       WHERE ci.collection_id = ? AND d.deleted_at IS NULL ORDER BY ci.ord`,
      [collectionId],
    )
    .map((r) => r.document_id);
}

export function renameCollection(db: Db, id: string, name: string): void {
  db.run('UPDATE collections SET name = ? WHERE id = ?', [name.trim(), id]);
}

export function deleteCollection(db: Db, id: string): void {
  db.run('DELETE FROM collections WHERE id = ?', [id]);
}

// ── Pronunciation dictionary ──

export interface DictionaryEntry extends DictionaryRule {
  id: string;
  documentId: string | null;
  enabled: boolean;
}

export function addDictionaryEntry(
  db: Db,
  e: {
    match: string;
    sayAs: string;
    wholeWord?: boolean;
    caseSensitive?: boolean;
    documentId?: string | null;
  },
  now = Date.now(),
): string {
  if (!e.match.trim() || !e.sayAs.trim())
    throw new Error('Both the written form and the pronunciation are needed');
  const id = newId(now);
  db.run(
    'INSERT INTO dictionary (id, match, say_as, whole_word, case_sensitive, document_id, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
    [
      id,
      e.match.trim(),
      e.sayAs.trim(),
      e.wholeWord === false ? 0 : 1,
      e.caseSensitive ? 1 : 0,
      e.documentId ?? null,
      now,
    ],
  );
  return id;
}

interface DictionaryRow {
  id: string;
  match: string;
  say_as: string;
  whole_word: number;
  case_sensitive: number;
  document_id: string | null;
  enabled: number;
}

const toEntry = (r: DictionaryRow): DictionaryEntry => ({
  id: r.id,
  match: r.match,
  sayAs: r.say_as,
  wholeWord: r.whole_word === 1,
  caseSensitive: r.case_sensitive === 1,
  documentId: r.document_id,
  enabled: r.enabled === 1,
});

export function listDictionary(db: Db, documentId?: string): DictionaryEntry[] {
  const rows =
    documentId === undefined
      ? db.all<DictionaryRow>('SELECT * FROM dictionary ORDER BY match COLLATE NOCASE')
      : db.all<DictionaryRow>(
          'SELECT * FROM dictionary WHERE document_id = ? ORDER BY match COLLATE NOCASE',
          [documentId],
        );
  return rows.map(toEntry);
}

/** Rules for narrating a document: its own entries first (they win), then global ones. */
export function rulesFor(db: Db, documentId: string): DictionaryRule[] {
  return db
    .all<DictionaryRow>(
      `SELECT * FROM dictionary WHERE enabled = 1 AND (document_id = ? OR document_id IS NULL)
       ORDER BY CASE WHEN document_id IS NULL THEN 1 ELSE 0 END`,
      [documentId],
    )
    .map(toEntry)
    .map(({ match, sayAs, wholeWord, caseSensitive }) => ({ match, sayAs, wholeWord, caseSensitive }));
}

export function updateDictionaryEntry(
  db: Db,
  id: string,
  patch: Partial<Pick<DictionaryEntry, 'match' | 'sayAs' | 'wholeWord' | 'caseSensitive' | 'enabled'>>,
): void {
  const row = db.get<DictionaryRow>('SELECT * FROM dictionary WHERE id = ?', [id]);
  if (!row) return;
  const e = { ...toEntry(row), ...patch };
  db.run(
    'UPDATE dictionary SET match = ?, say_as = ?, whole_word = ?, case_sensitive = ?, enabled = ? WHERE id = ?',
    [e.match.trim(), e.sayAs.trim(), e.wholeWord ? 1 : 0, e.caseSensitive ? 1 : 0, e.enabled ? 1 : 0, id],
  );
}

export function removeDictionaryEntry(db: Db, id: string): void {
  db.run('DELETE FROM dictionary WHERE id = ?', [id]);
}

// ── Settings (typed key/value) ──

export function getSetting<T>(db: Db, key: string, fallback: T): T {
  const r = db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  if (!r) return fallback;
  try {
    return JSON.parse(r.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting<T>(db: Db, key: string, value: T): void {
  db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, JSON.stringify(value)],
  );
}
