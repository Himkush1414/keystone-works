import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Db } from '../data/db';
import {
  continueItem,
  listItems,
  type LibraryItem,
  type Shelf,
  type SortKey,
  type StatusFilter,
} from '../data/library';
import type { ImportResult } from '../import/run';

/** What an import did, for the toast: how many were added, already there, or failed (with the first reason). */
export interface ImportSummary {
  added: string[];
  duplicates: string[];
  failed: { id: string | null; code: string }[];
}

export function summarize(results: readonly ImportResult[]): ImportSummary {
  const out: ImportSummary = { added: [], duplicates: [], failed: [] };
  for (const r of results) {
    if (r.status === 'ready') out.added.push(r.id);
    else if (r.status === 'duplicate') out.duplicates.push(r.id);
    else out.failed.push({ id: r.id, code: r.code });
  }
  return out;
}

export interface LibraryState {
  shelf: Shelf;
  sort: SortKey;
  status: StatusFilter;
  items: LibraryItem[];
  continueWith: LibraryItem | null;
  importing: boolean;
  setView(view: Partial<Pick<LibraryState, 'shelf' | 'sort' | 'status'>>): void;
  refresh(): void;
  /** Runs an import (picker, share, paste) and refreshes; null when the user cancelled. */
  runImport(start: () => Promise<ImportResult[] | null>): Promise<ImportSummary | null>;
}

/** The library as the screens see it. SQLite stays the source of truth; this is a refreshed view. */
export function createLibraryStore(db: Db): StoreApi<LibraryState> {
  return createStore<LibraryState>()((set, get) => ({
    shelf: 'all',
    sort: 'recent',
    status: 'all',
    items: [],
    continueWith: null,
    importing: false,
    setView(view) {
      set(view);
      get().refresh();
    },
    refresh() {
      const { shelf, sort, status } = get();
      set({ items: listItems(db, shelf, sort, status), continueWith: continueItem(db) ?? null });
    },
    async runImport(start) {
      set({ importing: true });
      try {
        const results = await start();
        return results ? summarize(results) : null;
      } finally {
        set({ importing: false });
        get().refresh();
      }
    },
  }));
}
