/**
 * The small database surface the app uses. Production runs on expo-sqlite; tests run the same SQL on Node's
 * built-in SQLite, so every query and migration is exercised in CI.
 */
export type SqlValue = string | number | null | Uint8Array;

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface Db {
  exec(sql: string): void;
  run(sql: string, params?: readonly SqlValue[]): RunResult;
  get<T>(sql: string, params?: readonly SqlValue[]): T | undefined;
  all<T>(sql: string, params?: readonly SqlValue[]): T[];
  /** Runs `fn` in a transaction; rolls back if it throws. Nested calls join the outer transaction. */
  transaction<T>(fn: () => T): T;
}

/** Wraps raw driver calls with transaction nesting handled once, for both adapters. */
export function withTransactions(base: Omit<Db, 'transaction'>): Db {
  let depth = 0;
  return {
    ...base,
    transaction<T>(fn: () => T): T {
      if (depth > 0) {
        depth++;
        try {
          return fn();
        } finally {
          depth--;
        }
      }
      depth = 1;
      base.exec('BEGIN IMMEDIATE');
      try {
        const out = fn();
        base.exec('COMMIT');
        return out;
      } catch (e) {
        base.exec('ROLLBACK');
        throw e;
      } finally {
        depth = 0;
      }
    },
  };
}
