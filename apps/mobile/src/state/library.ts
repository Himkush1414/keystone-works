import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Db } from '../data/db';
import {
  continueItem,
  listItems,
  restore,
  setFinished as setItemFinished,
  softDelete,
  updateDetails,
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
  /** Bumped when a document's content is replaced (a long PDF's whole book arriving after its first pages). */
  revisions: Record<string, number>;
  /** An import reports progress on `id`; `replaced` when its content was swapped for the whole book. */
  touch(id: string, replaced: boolean): void;
  setView(view: Partial<Pick<LibraryState, 'shelf' | 'sort' | 'status'>>): void;
  refresh(): void;
  /** Runs an import (picker, share, paste) and refreshes; null when the user cancelled. */
  runImport(start: () => Promise<ImportResult[] | null>): Promise<ImportSummary | null>;
  setFinished(id: string, finished: boolean): void;
  editDetails(id: string, details: { title?: string; author?: string | null }): void;
  /** Removes an item from the library; the returned function puts it back (the toast's Undo). */
  remove(id: string): () => void;
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
    revisions: {},
    touch(id, replaced) {
      if (replaced) set((s) => ({ revisions: { ...s.revisions, [id]: (s.revisions[id] ?? 0) + 1 } }));
      get().refresh();
    },
    setView(view) {
      set(view);
      get().refresh();
    },
    refresh() {
      const { shelf, sort, status } = get();
      set({ items: listItems(db, shelf, sort, status), continueWith: continueItem(db) ?? null });
    },
    setFinished(id, finished) {
      setItemFinished(db, id, finished);
      get().refresh();
    },
    editDetails(id, details) {
      updateDetails(db, id, details);
      get().refresh();
    },
    remove(id) {
      softDelete(db, id);
      get().refresh();
      return () => {
        restore(db, id);
        get().refresh();
      };
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
