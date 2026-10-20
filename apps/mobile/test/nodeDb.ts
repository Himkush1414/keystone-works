import { DatabaseSync } from 'node:sqlite';
import { withTransactions, type Db, type SqlValue } from '../src/data/db';
import { migrate } from '../src/data/migrations';

/** In-memory database for tests: same SQL and migrations as the app. */
export function testDb(): Db {
  const sqlite = new DatabaseSync(':memory:');
  const bind = (p?: readonly SqlValue[]) => (p ?? []) as (string | number | null | Uint8Array)[];
  const db = withTransactions({
    exec: (sql) => sqlite.exec(sql),
    run: (sql, params) => {
      const r = sqlite.prepare(sql).run(...bind(params));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    get: <T>(sql: string, params?: readonly SqlValue[]) =>
      sqlite.prepare(sql).get(...bind(params)) as T | undefined,
    all: <T>(sql: string, params?: readonly SqlValue[]) => sqlite.prepare(sql).all(...bind(params)) as T[],
  });
  migrate(db);
  return db;
}
