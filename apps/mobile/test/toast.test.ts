import { describe, expect, it } from 'vitest';
import { translate } from '../src/i18n/translate';
import { importMessage } from '../src/library/importMessage';
import { createToastStore, TOAST_MS, TOAST_WITH_ACTION_MS } from '../src/state/toast';

function fakeTimers() {
  const pending = new Map<number, { fn: () => void; ms: number }>();
  let next = 1;
  return {
    pending,
    set: (fn: () => void, ms: number) => {
      pending.set(next, { fn, ms });
      return next++;
    },
    clear: (h: unknown) => void pending.delete(h as number),
    fireAll: () => [...pending.values()].forEach((p) => p.fn()),
  };
}

describe('toast store', () => {
  it('shows a toast and hides it after 4 seconds', () => {
    const timers = fakeTimers();
    const store = createToastStore(timers);
    store.getState().show({ message: 'Hello' });
    expect(store.getState().current?.message).toBe('Hello');
    expect([...timers.pending.values()].map((p) => p.ms)).toEqual([TOAST_MS]);
    timers.fireAll();
    expect(store.getState().current).toBeNull();
  });

  it('keeps a toast with an action longer', () => {
    const timers = fakeTimers();
    createToastStore(timers)
      .getState()
      .show({ message: 'x', action: { label: 'Undo', run: () => undefined } });
    expect([...timers.pending.values()].map((p) => p.ms)).toEqual([TOAST_WITH_ACTION_MS]);
  });

  it('replaces the current toast and restarts the clock', () => {
    const timers = fakeTimers();
    const store = createToastStore(timers);
    store.getState().show({ message: 'first' });
    store.getState().show({ message: 'second' });
    expect(timers.pending.size).toBe(1);
    expect(store.getState().current?.message).toBe('second');
  });

  it('ignores a late dismiss meant for an older toast', () => {
    const store = createToastStore(fakeTimers());
    store.getState().show({ message: 'first' });
    const firstId = store.getState().current?.id;
    store.getState().show({ message: 'second' });
    store.getState().dismiss(firstId);
    expect(store.getState().current?.message).toBe('second');
  });
});

describe('importMessage', () => {
  const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) =>
    translate('en', key, params);
  const none = { added: [], duplicates: [], failed: [] };

  it('counts what was added', () => {
    expect(importMessage({ ...none, added: ['a'] }, t, () => undefined)).toEqual({
      message: 'Added to your library',
    });
    expect(importMessage({ ...none, added: ['a', 'b'] }, t, () => undefined)?.message).toBe(
      'Added 2 items to your library',
    );
  });

  it('explains why a file could not be opened', () => {
    expect(importMessage({ ...none, failed: [{ id: null, code: 'drm' }] }, t, () => undefined)).toEqual({
      message: 'This book is protected by DRM, so Lamplight can’t open it.',
      tone: 'danger',
    });
    expect(
      importMessage({ ...none, failed: [{ id: 'x', code: 'weird' }] }, t, () => undefined)?.message,
    ).toBe('Something went wrong.');
  });

  it('mentions a failure next to what was added', () => {
    const m = importMessage(
      { ...none, added: ['a'], failed: [{ id: null, code: 'empty' }] },
      t,
      () => undefined,
    );
    expect(m).toEqual({
      message: 'Added to your library. There’s no text to read in this file.',
      tone: 'danger',
    });
  });

  it('offers to open an item that was already there', () => {
    const opened: string[] = [];
    const m = importMessage({ ...none, duplicates: ['d1'] }, t, (id) => opened.push(id));
    expect(m?.message).toBe('This is already in your library.');
    m?.action?.run();
    expect(opened).toEqual(['d1']);
  });

  it('says nothing when nothing happened', () => {
    expect(importMessage(none, t, () => undefined)).toBeNull();
  });
});
