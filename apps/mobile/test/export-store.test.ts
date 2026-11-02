import { describe, expect, it } from 'vitest';
import { createExportStore, exportBusy, exportTimeLeft } from '../src/state/export';

describe('export store', () => {
  it('follows an export from start to finish', () => {
    const s = createExportStore();
    s.getState().begin('d1', 'Lamp', 0);
    expect(exportBusy(s.getState())).toBe(true);
    s.getState().progress({ done: 0, total: 100, waiting: false }, 1_000);
    s.getState().progress({ done: 10, total: 100, waiting: false }, 21_000);
    expect(exportTimeLeft(s.getState(), 21_000)).toBe(180_000);
    s.getState().finish({ folder: 'Lamp', files: 3, durationMs: 60_000 });
    expect(s.getState()).toMatchObject({ phase: 'done', done: 100, result: { files: 3 } });
    expect(exportBusy(s.getState())).toBe(false);
  });

  it('leaves time spent waiting for narration out of the estimate', () => {
    const s = createExportStore();
    s.getState().begin('d1', 'Lamp', 0);
    s.getState().progress({ done: 0, total: 100, waiting: false }, 0);
    s.getState().progress({ done: 10, total: 100, waiting: false }, 10_000);
    s.getState().progress({ done: 10, total: 100, waiting: true }, 11_000);
    expect(exportTimeLeft(s.getState(), 500_000)).toBeNull();
    // Ten minutes of narration later, the export resumes: the estimate keeps the pace from before.
    s.getState().progress({ done: 10, total: 100, waiting: false }, 611_000);
    s.getState().progress({ done: 20, total: 100, waiting: false }, 621_000);
    expect(exportTimeLeft(s.getState(), 621_000)).toBe(84_000);
  });

  it('ignores progress after a cancel or failure', () => {
    const s = createExportStore();
    s.getState().begin('d1', 'Lamp', 0);
    s.getState().cancelled();
    s.getState().progress({ done: 5, total: 10, waiting: false }, 100);
    expect(s.getState()).toMatchObject({ phase: 'cancelled', done: 0 });
    s.getState().begin('d1', 'Lamp', 0);
    s.getState().fail('export-write');
    expect(s.getState()).toMatchObject({ phase: 'failed', error: 'export-write' });
  });
});
