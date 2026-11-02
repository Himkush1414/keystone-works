/**
 * Errors the app hit, kept on the phone so Settings › Diagnostics can show them and the report can include
 * them, including the one that closed the app last time. Nothing leaves the phone (privacy policy).
 *
 * Messages are cut short and stacks keep only their first frames, so a report never carries much text; an
 * error message can quote a sentence, and a few words of it are enough to find a bug.
 */

export type ErrorSource = 'js' | 'promise' | 'screen' | 'native';

export interface ErrorEntry {
  /** Epoch ms of the last time it happened. */
  at: number;
  source: ErrorSource;
  /** True when it closed the app (or would have, without the error screen). */
  fatal: boolean;
  message: string;
  /** The first frames of the stack, one per line. */
  stack?: string;
  /** How many times in a row it happened. */
  count: number;
}

export const MAX_ERRORS = 20;
const MAX_MESSAGE = 300;
const STACK_FRAMES = 6;

function messageOf(error: unknown): string {
  if (error instanceof Error) return `${error.name === 'Error' ? '' : `${error.name}: `}${error.message}`;
  if (typeof error === 'string') return error;
  if (error === undefined || error === null) return '';
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

/** One log entry for `error`, trimmed for the log. */
export function errorEntry(
  error: unknown,
  source: ErrorSource,
  fatal: boolean,
  now = Date.now(),
): ErrorEntry {
  const raw = messageOf(error).replace(/\s+/g, ' ').trim() || 'Unknown error';
  const message = raw.length > MAX_MESSAGE ? `${raw.slice(0, MAX_MESSAGE - 1)}…` : raw;
  const stackText = error instanceof Error ? error.stack : undefined;
  const frames = stackText
    ?.split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('at ') || /^\S+@/.test(l))
    .slice(0, STACK_FRAMES);
  return {
    at: now,
    source,
    fatal,
    message,
    ...(frames?.length ? { stack: frames.join('\n') } : {}),
    count: 1,
  };
}

/** `list` with `entry` added (newest last); a repeat of the newest entry counts up instead of filling the log. */
export function appendError(list: readonly ErrorEntry[], entry: ErrorEntry, max = MAX_ERRORS): ErrorEntry[] {
  const last = list[list.length - 1];
  if (last && last.message === entry.message && last.source === entry.source) {
    return [
      ...list.slice(0, -1),
      { ...last, at: entry.at, fatal: last.fatal || entry.fatal, count: last.count + 1 },
    ];
  }
  return [...list, entry].slice(-max);
}

/** Reads a stored log, ignoring anything that isn't one (a cut-off write, an older format). */
export function parseErrors(text: string | null): ErrorEntry[] {
  if (!text) return [];
  try {
    const value: unknown = JSON.parse(text);
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (e): e is ErrorEntry =>
          !!e &&
          typeof e === 'object' &&
          typeof (e as ErrorEntry).at === 'number' &&
          typeof (e as ErrorEntry).message === 'string',
      )
      .map((e) => ({ ...e, count: typeof e.count === 'number' ? e.count : 1, fatal: !!e.fatal }))
      .slice(-MAX_ERRORS);
  } catch {
    return [];
  }
}

/** One entry as plain text for the diagnostics report. */
export function formatError(e: ErrorEntry): string {
  const head = `${new Date(e.at).toISOString()} ${e.source}${e.fatal ? ' FATAL' : ''}${
    e.count > 1 ? ` ×${e.count}` : ''
  }: ${e.message}`;
  return e.stack ? `${head}\n  ${e.stack.split('\n').join('\n  ')}` : head;
}

/** Where the log lives: a small file on the phone. Both calls are synchronous so a crash can still write. */
export interface ErrorSink {
  read(): string | null;
  write(text: string): void;
}

export interface ErrorLog {
  list(): ErrorEntry[];
  record(error: unknown, source: ErrorSource, fatal?: boolean): void;
  clear(): void;
}

export function createErrorLog(sink: ErrorSink, now: () => number = Date.now): ErrorLog {
  let entries: ErrorEntry[] | null = null;
  const load = () => {
    if (!entries) {
      try {
        entries = parseErrors(sink.read());
      } catch {
        entries = [];
      }
    }
    return entries;
  };
  const save = () => {
    try {
      sink.write(JSON.stringify(entries ?? []));
    } catch {
      // The log must never be the thing that fails.
    }
  };
  return {
    list: () => [...load()],
    record(error, source, fatal = false) {
      entries = appendError(load(), errorEntry(error, source, fatal, now()));
      save();
    },
    clear() {
      entries = [];
      save();
    },
  };
}

interface GlobalErrorUtils {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}

interface HermesTracker {
  enablePromiseRejectionTracker?(options: {
    allRejections: boolean;
    onUnhandled(id: number, error: unknown): void;
    onHandled?(id: number): void;
  }): void;
}

/**
 * Sends uncaught errors and unhandled promise rejections to `log`, then on to React Native's own handler
 * (which still closes the app on a fatal error, as it should). Returns a function that undoes it.
 */
export function installErrorCapture(
  log: ErrorLog,
  g: { ErrorUtils?: GlobalErrorUtils; HermesInternal?: HermesTracker } = globalThis as never,
): () => void {
  const utils = g.ErrorUtils;
  const previous = utils?.getGlobalHandler();
  utils?.setGlobalHandler((error, isFatal) => {
    log.record(error, 'js', !!isFatal);
    previous?.(error, isFatal);
  });
  // In release builds React Native doesn't track rejections at all; a lost promise failed silently.
  g.HermesInternal?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id, error) => log.record(error, 'promise'),
  });
  return () => {
    if (previous) utils?.setGlobalHandler(previous);
  };
}
