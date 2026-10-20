import { openDatabaseSync, type SQLiteBindValue } from 'expo-sqlite';
import { withTransactions, type Db, type SqlValue } from './db';
import { migrate } from './migrations';

let instance: Db | null = null;

/** The app database (WAL, foreign keys on), migrated on first use. */
export function getDb(): Db {
  if (instance) return instance;
  const sqlite = openDatabaseSync('lamplight.db');
  sqlite.execSync('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
  const bind = (params?: readonly SqlValue[]) => (params ?? []) as SQLiteBindValue[];
  const db = withTransactions({
    exec: (sql) => sqlite.execSync(sql),
    run: (sql, params) => {
      const r = sqlite.runSync(sql, bind(params));
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    get: <T>(sql: string, params?: readonly SqlValue[]) =>
      sqlite.getFirstSync<T>(sql, bind(params)) ?? undefined,
    all: <T>(sql: string, params?: readonly SqlValue[]) => sqlite.getAllSync<T>(sql, bind(params)),
  });
  migrate(db);
  instance = db;
  return db;
}
