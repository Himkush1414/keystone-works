import type { Db } from './db';

export interface Migration {
  id: number;
  name: string;
  up(db: Db): void;
}

/** Ordered and append-only: never edit a migration that has shipped; add a new one. */
export const migrations: Migration[] = [
  {
    id: 1,
    name: 'initial',
    up(db) {
      db.exec(`
        CREATE TABLE documents (
          id             TEXT PRIMARY KEY,
          kind           TEXT NOT NULL CHECK (kind IN ('book','document','article','note')),
          title          TEXT NOT NULL,
          author         TEXT,
          source         TEXT NOT NULL CHECK (source IN ('file','share','url','paste','sample')),
          source_uri     TEXT,
          site_name      TEXT,
          published_at   INTEGER,
          language       TEXT NOT NULL DEFAULT 'en',
          cover_path     TEXT,
          sha256         TEXT,
          byte_size      INTEGER,
          status         TEXT NOT NULL DEFAULT 'importing' CHECK (status IN ('importing','ready','failed')),
          error_code     TEXT,
          word_count     INTEGER NOT NULL DEFAULT 0,
          sentence_count INTEGER NOT NULL DEFAULT 0,
          settings_json  TEXT NOT NULL DEFAULT '{}',
          added_at       INTEGER NOT NULL,
          opened_at      INTEGER,
          finished_at    INTEGER,
          deleted_at     INTEGER
        );
        CREATE UNIQUE INDEX documents_sha ON documents(sha256) WHERE sha256 IS NOT NULL AND deleted_at IS NULL;
        CREATE INDEX documents_opened ON documents(opened_at DESC);
        CREATE INDEX documents_kind ON documents(kind, added_at DESC);

        CREATE TABLE chapters (
          document_id    TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          ord            INTEGER NOT NULL,
          title          TEXT NOT NULL,
          level          INTEGER NOT NULL DEFAULT 1,
          language       TEXT,
          block_start    INTEGER NOT NULL,
          first_sentence INTEGER NOT NULL,
          PRIMARY KEY (document_id, ord)
        ) WITHOUT ROWID;

        CREATE TABLE blocks (
          document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          ord         INTEGER NOT NULL,
          kind        TEXT NOT NULL,
          level       INTEGER,
          page        INTEGER,
          text        TEXT NOT NULL,
          skips_json  TEXT,
          PRIMARY KEY (document_id, ord)
        ) WITHOUT ROWID;

        CREATE TABLE sentences (
          document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          ord         INTEGER NOT NULL,
          block_ord   INTEGER NOT NULL,
          start       INTEGER NOT NULL,
          end         INTEGER NOT NULL,
          kind        TEXT NOT NULL CHECK (kind IN ('narration','dialogue','heading')),
          speaker_id  TEXT,
          confidence  REAL NOT NULL DEFAULT 0,
          pause_ms    INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (document_id, ord)
        ) WITHOUT ROWID;
        CREATE INDEX sentences_block ON sentences(document_id, block_ord);

        CREATE TABLE characters (
          document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          id           TEXT NOT NULL,
          name         TEXT NOT NULL,
          aliases_json TEXT NOT NULL DEFAULT '[]',
          gender       TEXT CHECK (gender IN ('f','m') OR gender IS NULL),
          line_count   INTEGER NOT NULL DEFAULT 0,
          voice_id     TEXT,
          PRIMARY KEY (document_id, id)
        ) WITHOUT ROWID;

        CREATE TABLE positions (
          document_id  TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
          sentence_ord INTEGER NOT NULL,
          offset_ms    INTEGER NOT NULL DEFAULT 0,
          progress     REAL NOT NULL DEFAULT 0,
          listened_ms  INTEGER NOT NULL DEFAULT 0,
          updated_at   INTEGER NOT NULL
        );

        CREATE TABLE bookmarks (
          id           TEXT PRIMARY KEY,
          document_id  TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          sentence_ord INTEGER NOT NULL,
          label        TEXT,
          created_at   INTEGER NOT NULL
        );
        CREATE INDEX bookmarks_doc ON bookmarks(document_id, sentence_ord);

        CREATE TABLE highlights (
          id          TEXT PRIMARY KEY,
          document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          block_ord   INTEGER NOT NULL,
          start       INTEGER NOT NULL,
          end         INTEGER NOT NULL,
          color       TEXT NOT NULL DEFAULT 'amber',
          note        TEXT,
          created_at  INTEGER NOT NULL
        );
        CREATE INDEX highlights_doc ON highlights(document_id, block_ord);

        CREATE TABLE collections (
          id         TEXT PRIMARY KEY,
          name       TEXT NOT NULL,
          ord        INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE collection_items (
          collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
          document_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          ord           INTEGER NOT NULL,
          PRIMARY KEY (collection_id, document_id)
        ) WITHOUT ROWID;

        CREATE TABLE dictionary (
          id             TEXT PRIMARY KEY,
          match          TEXT NOT NULL,
          say_as         TEXT NOT NULL,
          whole_word     INTEGER NOT NULL DEFAULT 1,
          case_sensitive INTEGER NOT NULL DEFAULT 0,
          document_id    TEXT REFERENCES documents(id) ON DELETE CASCADE,
          enabled        INTEGER NOT NULL DEFAULT 1,
          created_at     INTEGER NOT NULL
        );
        CREATE INDEX dictionary_scope ON dictionary(document_id);

        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

        CREATE TABLE listening_days (
          day         TEXT PRIMARY KEY,
          listened_ms INTEGER NOT NULL DEFAULT 0
        );

        CREATE VIRTUAL TABLE documents_fts USING fts5(
          title, author, content='documents', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2'
        );
        CREATE TRIGGER documents_fts_ai AFTER INSERT ON documents BEGIN
          INSERT INTO documents_fts(rowid, title, author) VALUES (new.rowid, new.title, coalesce(new.author, ''));
        END;
        CREATE TRIGGER documents_fts_ad AFTER DELETE ON documents BEGIN
          INSERT INTO documents_fts(documents_fts, rowid, title, author) VALUES ('delete', old.rowid, old.title, coalesce(old.author, ''));
        END;
        CREATE TRIGGER documents_fts_au AFTER UPDATE OF title, author ON documents BEGIN
          INSERT INTO documents_fts(documents_fts, rowid, title, author) VALUES ('delete', old.rowid, old.title, coalesce(old.author, ''));
          INSERT INTO documents_fts(rowid, title, author) VALUES (new.rowid, new.title, coalesce(new.author, ''));
        END;

        CREATE VIRTUAL TABLE blocks_fts USING fts5(
          text, document_id UNINDEXED, ord UNINDEXED, tokenize='unicode61 remove_diacritics 2'
        );
      `);
    },
  },
];

/** Applies pending migrations in one transaction each. Returns the resulting schema version. */
export function migrate(db: Db): number {
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const row = db.get<{ value: string }>("SELECT value FROM schema_meta WHERE key = 'version'");
  let version = row ? Number(row.value) : 0;
  const latest = migrations[migrations.length - 1]?.id ?? 0;
  if (version > latest) {
    throw new Error(`Database version ${version} is newer than this app (${latest}). Update Lamplight.`);
  }
  for (const m of migrations) {
    if (m.id <= version) continue;
    db.transaction(() => {
      m.up(db);
      db.run(
        "INSERT INTO schema_meta (key, value) VALUES ('version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [String(m.id)],
      );
    });
    version = m.id;
  }
  return version;
}
