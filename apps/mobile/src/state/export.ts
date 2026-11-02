import { createStore, type StoreApi } from 'zustand/vanilla';
import { exportEta } from '../player/export';

export type ExportPhase = 'idle' | 'preparing' | 'running' | 'done' | 'failed' | 'cancelled';

export interface ExportResult {
  folder: string;
  files: number;
  durationMs: number;
}

/**
 * The audio export under way (one at a time), outside any screen: the sheet can close and reopen while the
 * engine works, and the library can tell when it ends.
 */
export interface ExportState {
  docId: string | null;
  title: string;
  phase: ExportPhase;
  done: number;
  total: number;
  /** Narration is playing, so the export is giving way to it. */
  waiting: boolean;
  /** Time spent exporting (waits left out), for the estimate. */
  activeMs: number;
  lastAt: number;
  result: ExportResult | null;
  /** Error code when `phase` is "failed". */
  error: string | null;
  begin(docId: string, title: string, now: number): void;
  progress(e: { done: number; total: number; waiting: boolean }, now: number): void;
  finish(result: ExportResult): void;
  fail(code: string): void;
  cancelled(): void;
  reset(): void;
}

const IDLE = {
  docId: null,
  title: '',
  phase: 'idle' as ExportPhase,
  done: 0,
  total: 0,
  waiting: false,
  activeMs: 0,
  lastAt: 0,
  result: null,
  error: null,
};

export function createExportStore(): StoreApi<ExportState> {
  return createStore<ExportState>()((set, get) => ({
    ...IDLE,
    begin(docId, title, now) {
      set({ ...IDLE, docId, title, phase: 'preparing', lastAt: now });
    },
    progress(e, now) {
      const prev = get();
      if (prev.phase !== 'preparing' && prev.phase !== 'running') return;
      const active = prev.phase === 'running' && !prev.waiting ? now - prev.lastAt : 0;
      set({
        phase: 'running',
        done: e.done,
        total: e.total,
        waiting: e.waiting,
        activeMs: prev.activeMs + active,
        lastAt: now,
      });
    },
    finish(result) {
      set({ phase: 'done', result, waiting: false, done: get().total });
    },
    fail(code) {
      set({ phase: 'failed', error: code, waiting: false });
    },
    cancelled() {
      set({ phase: 'cancelled', waiting: false });
    },
    reset() {
      set(IDLE);
    },
  }));
}

/** True while an export is being prepared or written. */
export const exportBusy = (s: Pick<ExportState, 'phase'>) => s.phase === 'preparing' || s.phase === 'running';

/** Time left in ms, from the pace while actually exporting; null until there's enough to go on or while waiting. */
export function exportTimeLeft(s: ExportState, now: number): number | null {
  if (s.phase !== 'running' || s.waiting) return null;
  return exportEta(s.done, s.total, s.activeMs + (now - s.lastAt));
}
