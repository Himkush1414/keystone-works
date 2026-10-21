import { createStore, type StoreApi } from 'zustand/vanilla';

export interface ToastSpec {
  message: string;
  tone?: 'neutral' | 'danger';
  action?: { label: string; run(): void };
}

export interface Toast extends ToastSpec {
  id: number;
}

export interface ToastState {
  current: Toast | null;
  show(spec: ToastSpec): void;
  dismiss(id?: number): void;
}

/** 4 s on screen (design system); 8 s when there's an action, so someone using TalkBack can reach it. */
export const TOAST_MS = 4_000;
export const TOAST_WITH_ACTION_MS = 8_000;

interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** One toast at a time: a new one replaces the current one and restarts the clock. */
export function createToastStore(timers: Timers = realTimers): StoreApi<ToastState> {
  let nextId = 1;
  let handle: unknown = null;
  return createStore<ToastState>()((set, get) => ({
    current: null,
    show(spec) {
      if (handle !== null) timers.clear(handle);
      const toast = { ...spec, id: nextId++ };
      set({ current: toast });
      handle = timers.set(() => get().dismiss(toast.id), spec.action ? TOAST_WITH_ACTION_MS : TOAST_MS);
    },
    dismiss(id) {
      const { current } = get();
      if (!current || (id !== undefined && current.id !== id)) return;
      if (handle !== null) timers.clear(handle);
      handle = null;
      set({ current: null });
    },
  }));
}
