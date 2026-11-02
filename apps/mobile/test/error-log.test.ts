import { describe, expect, it, vi } from 'vitest';
import {
  appendError,
  createErrorLog,
  errorEntry,
  formatError,
  installErrorCapture,
  MAX_ERRORS,
  parseErrors,
  type ErrorSink,
} from '../src/services/errorLog';

const memory = (initial: string | null = null): ErrorSink & { text: string | null } => {
  const sink = {
    text: initial,
    read: () => sink.text,
    write: (t: string) => {
      sink.text = t;
    },
  };
  return sink;
};

describe('errorEntry', () => {
  it('keeps a short message and the first stack frames', () => {
    const e = new TypeError('x is undefined');
    e.stack = [
      'TypeError: x is undefined',
      ...Array.from({ length: 10 }, (_, i) => `    at f${i} (a.js:1:${i})`),
    ].join('\n');
    const entry = errorEntry(e, 'js', true, 5);
    expect(entry).toMatchObject({
      at: 5,
      source: 'js',
      fatal: true,
      message: 'TypeError: x is undefined',
      count: 1,
    });
    expect(entry.stack?.split('\n')).toHaveLength(6);
    expect(entry.stack?.startsWith('at f0')).toBe(true);
  });

  it('cuts a long message and copes with things that are not errors', () => {
    expect(errorEntry('a'.repeat(1000), 'promise', false).message).toHaveLength(300);
    expect(errorEntry({ code: 7 }, 'promise', false).message).toBe('{"code":7}');
    expect(errorEntry(undefined, 'promise', false).message).toBe('Unknown error');
  });
});

describe('appendError', () => {
  it('counts a repeat instead of filling the log, and keeps the newest entries', () => {
    const a = errorEntry(new Error('boom'), 'js', false, 1);
    const twice = appendError(appendError([], a), { ...a, at: 2, fatal: true });
    expect(twice).toHaveLength(1);
    expect(twice[0]).toMatchObject({ at: 2, count: 2, fatal: true });
    let list = twice;
    for (let i = 0; i < 30; i++) list = appendError(list, errorEntry(new Error(`e${i}`), 'js', false, i));
    expect(list).toHaveLength(MAX_ERRORS);
    expect(list[list.length - 1]?.message).toBe('e29');
  });
});

describe('createErrorLog', () => {
  it('writes every error at once, so the one that closes the app is there next launch', () => {
    const sink = memory();
    createErrorLog(sink, () => 42).record(new Error('fatal one'), 'js', true);
    const next = createErrorLog(sink);
    expect(next.list()).toMatchObject([{ message: 'fatal one', fatal: true, at: 42 }]);
    next.clear();
    expect(createErrorLog(sink).list()).toEqual([]);
  });

  it('ignores a damaged file, and never throws when the file cannot be written', () => {
    expect(parseErrors('{not json')).toEqual([]);
    expect(parseErrors('[{"at":1,"message":"ok"},{"oops":true}]')).toEqual([
      { at: 1, message: 'ok', count: 1, fatal: false },
    ]);
    const log = createErrorLog({
      read: () => {
        throw new Error('no disk');
      },
      write: () => {
        throw new Error('disk full');
      },
    });
    expect(() => log.record(new Error('x'), 'js')).not.toThrow();
    expect(log.list()).toHaveLength(1);
  });
});

describe('formatError', () => {
  it('says when, where, whether it was fatal and how often', () => {
    const e = {
      at: Date.UTC(2026, 10, 2),
      source: 'js' as const,
      fatal: true,
      message: 'boom',
      count: 3,
      stack: 'at a\nat b',
    };
    expect(formatError(e)).toBe('2026-11-02T00:00:00.000Z js FATAL ×3: boom\n  at a\n  at b');
  });
});

describe('installErrorCapture', () => {
  it('logs uncaught errors and unhandled rejections, and still calls the default handler', () => {
    const sink = memory();
    const log = createErrorLog(sink);
    const original = vi.fn();
    let handler: (e: unknown, fatal?: boolean) => void = original;
    let onUnhandled: ((id: number, e: unknown) => void) | undefined;
    const g = {
      ErrorUtils: { getGlobalHandler: () => handler, setGlobalHandler: (h: typeof handler) => (handler = h) },
      HermesInternal: {
        enablePromiseRejectionTracker: (o: { onUnhandled(id: number, e: unknown): void }) => {
          onUnhandled = o.onUnhandled;
        },
      },
    };
    const undo = installErrorCapture(log, g);
    handler(new Error('render crash'), true);
    onUnhandled?.(1, new Error('lost promise'));
    expect(original).toHaveBeenCalledOnce();
    expect(log.list().map((e) => [e.source, e.fatal, e.message])).toEqual([
      ['js', true, 'render crash'],
      ['promise', false, 'lost promise'],
    ]);
    undo();
    expect(handler).toBe(original);
  });
});
