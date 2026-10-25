import {
  assignVoices,
  buildQueue,
  DEFAULT_NARRATOR,
  defaultCleanSettings,
  VOICE_CATALOG,
  type CastMode,
  type CleanSettings,
  type QueueOptions,
  cleanReport,
  type CleanReport,
  type SkipReason,
} from '@lamplight/core';
import type { StoreApi } from 'zustand/vanilla';
import type { Quality, QueueFile } from '../../modules/lamplight-engine/src/types';
import type { QueueSegment } from '@lamplight/core';
import {
  correctSpeaker,
  loadContent,
  mergeCharacters,
  saveAutoVoices,
  setCharacterVoice,
  type DocumentContent,
} from '../data/content';
import type { Db } from '../data/db';
import { getItem, markOpened, updateSettings, type LibraryItem } from '../data/library';
import { getPosition, rulesFor, savePosition } from '../data/userdata';
import type { Settings } from '../state/settings';
import { forPlayer, isComplete, partialQueueFile, toQueueFile, withSegments, type QueueMeta } from './queue';
import type { PlayerMirror } from './store';

export type SessionSettings = Pick<
  Settings,
  | 'castMode'
  | 'quality'
  | 'defaultSpeed'
  | 'voices'
  | 'speakUrls'
  | 'rewindOnResume'
  | 'expressive'
  | 'breaths'
  | 'voiceProcessing'
>;

export interface SessionPlan {
  queue: QueueFile;
  startIndex: number;
  startMs: number;
  speed: number;
  quality: Quality;
}

/** Clean Read settings for a document: format defaults, the global URL choice, then the document's own. */
export function cleanSettingsFor(
  item: LibraryItem,
  content: DocumentContent,
  speakUrls: boolean,
): CleanSettings {
  const fromPdf = content.blocks.some((b) => b.page !== undefined);
  const own = Object.fromEntries(
    Object.entries(item.settings.clean ?? {}).filter(
      (e): e is [string, boolean] => typeof e[1] === 'boolean',
    ),
  );
  return { ...defaultCleanSettings(item.kind, fromPdf), url: !speakUrls, ...own };
}

/** What building a document's queue needs, read once; the queue itself is built in ranges from it. */
export interface QueueContext {
  item: LibraryItem;
  content: DocumentContent;
  options: QueueOptions;
  meta: QueueMeta;
  /** Hash of every input of the queue: a queue built with the same key can be reused as is. */
  key: string;
}

/** Bump when the queue format or how it's built changes, so cached queues are rebuilt. */
const QUEUE_FORMAT = 1;

/** Reads the document and the listener's choices, and settles Cast's voices (saved the first time). */
export function queueContext(db: Db, documentId: string, settings: SessionSettings): QueueContext {
  const item = getItem(db, documentId);
  if (!item || item.status !== 'ready') throw new Error(`document ${documentId} is not ready to play`);
  const content = loadContent(db, documentId);

  const narrator = item.settings.voice ?? settings.voices[item.language] ?? DEFAULT_NARRATOR;
  const overrides: Record<string, string> = {};
  const saved: Record<string, string> = {};
  for (const c of content.characters) {
    if (c.voiceId) overrides[c.id] = c.voiceId;
    if (c.autoVoiceId) saved[c.id] = c.autoVoiceId;
  }
  const characters = content.characters.map((c) => ({
    id: c.id,
    name: c.name,
    aliases: c.aliases,
    lines: c.lineCount,
    ...(c.gender ? { gender: c.gender } : {}),
    ...(c.age ? { age: c.age } : {}),
    ...(c.temperament ? { temperament: c.temperament } : {}),
  }));
  const assignment = assignVoices(characters, narrator, VOICE_CATALOG, overrides, saved);
  // The first time a book plays, Cast's choices are written down so they hold for the whole book.
  const fresh = Object.fromEntries(
    content.characters
      .filter(
        (c) => !c.voiceId && assignment.byCharacter[c.id] && assignment.byCharacter[c.id] !== c.autoVoiceId,
      )
      .map((c) => [c.id, assignment.byCharacter[c.id] ?? '']),
  );
  if (Object.keys(fresh).length) saveAutoVoices(db, documentId, fresh);
  const options: QueueOptions = {
    clean: cleanSettingsFor(item, content, settings.speakUrls),
    customSkips: item.settings.customSkips ?? [],
    dictionary: rulesFor(db, documentId),
    assignment,
    castMode: (item.settings.castMode ?? settings.castMode) as CastMode,
    expressive: settings.expressive,
    breaths: settings.breaths,
    voiceProcessing: settings.voiceProcessing,
  };
  const meta = { docId: item.id, title: item.title, author: item.author, artworkUri: item.coverPath };
  const key = hashKey(
    JSON.stringify([
      QUEUE_FORMAT,
      item.addedAt,
      item.language,
      content.sentences.length,
      content.blocks.length,
      // Cast's automatic picks are saved on first play; the assignment in `options` already carries them.
      content.characters.map(({ autoVoiceId: _, ...c }) => c),
      // Speakers the listener set change who speaks without changing any count.
      item.settings.speakerFixes ?? [],
      meta,
      options,
    ]),
  );
  return { item, content, options, meta, key };
}

/** Sentences built per step when a queue is built in the background (yielding to the UI in between). */
export const QUEUE_CHUNK = 200;
/** Sentences built before narration starts, when no finished queue is cached. */
export const QUEUE_WINDOW = 40;
/** Neighbours built on each side of a range so its pauses and breaths match a whole-book build. */
const OVERLAP = 8;

/** The queue segments for sentences `from` (inclusive) to `to` (exclusive), as a whole-book build makes them. */
export function buildRange(ctx: QueueContext, from: number, to: number): QueueSegment[] {
  const n = ctx.content.sentences.length;
  const a = Math.max(0, from);
  const b = Math.min(n, to);
  if (b <= a) return [];
  return buildQueue(
    { ...ctx.content, language: ctx.item.language },
    { ...ctx.options, from: Math.max(0, a - OVERLAP), to: Math.min(n, b + OVERLAP) },
  ).filter((s) => s.i >= a && s.i < b);
}

/** Where narration starts: the saved position (from the start of that sentence), or `at`. */
export function startPoint(
  db: Db,
  ctx: QueueContext,
  settings: SessionSettings,
  at?: number,
): Omit<SessionPlan, 'queue'> {
  const { item } = ctx;
  const documentId = item.id;
  const segments = ctx.content.sentences;
  // Resume where the listener stopped, from the start of that sentence (R-PL-9); a finished item restarts.
  const pos = getPosition(db, documentId);
  const finished = item.finishedAt !== null || (pos?.progress ?? 0) >= 1;
  const last = Math.max(0, segments.length - 1);
  const resumeAt = finished || !pos ? 0 : Math.min(pos.sentenceOrd, last);
  const startIndex = at === undefined ? resumeAt : Math.min(Math.max(0, at), last);
  const startMs = at !== undefined || finished || !pos || settings.rewindOnResume ? 0 : pos.offsetMs;
  return {
    startIndex,
    startMs,
    speed: item.settings.speed ?? settings.defaultSpeed,
    quality: item.settings.quality ?? settings.quality,
  };
}

/** Everything the native player needs to narrate `documentId` from where the listener left off (whole book). */
export function planSession(
  db: Db,
  documentId: string,
  settings: SessionSettings,
  /** Start at this sentence instead of the saved position (a search result). */
  at?: number,
): SessionPlan {
  const ctx = queueContext(db, documentId, settings);
  const segments = buildQueue({ ...ctx.content, language: ctx.item.language }, ctx.options);
  const queue = toQueueFile(ctx.meta, ctx.content.chapters, ctx.content.sentences, segments);
  return { queue: { ...queue, key: ctx.key }, ...startPoint(db, ctx, settings, at) };
}

/** 64-bit FNV-1a, as hex: cheap, and plenty to tell two sets of queue inputs apart. */
export function hashKey(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export interface SessionDeps {
  db: Db;
  store: StoreApi<PlayerMirror>;
  engine: {
    loadQueue(
      path: string,
      startIndex: number,
      startMs: number,
      speed: number,
      quality: Quality,
    ): Promise<void>;
    play(): Promise<void>;
    fillSegments?(json: string): Promise<void>;
  };
  /** Writes the queue JSON where the native player can read it; returns the path. */
  writeQueue(docId: string, json: string): Promise<string>;
  /** The queue JSON written last for this document, if any (a finished one is reused when its key matches). */
  readQueue?(docId: string): Promise<string | null>;
  /** Lets the screen draw and touches land between steps of background work. */
  yieldToUi?(): Promise<void>;
  now?(): number;
}

/** The newest build per document; an older one (the book was reopened, or re-voiced) stops at its next step. */
const builds = new Map<string, number>();
const nextBuild = (docId: string) => {
  const n = (builds.get(docId) ?? 0) + 1;
  builds.set(docId, n);
  return n;
};
const defaultYield = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** A finished queue cached for these exact inputs, or null. */
async function cachedQueue(
  deps: Pick<SessionDeps, 'readQueue'>,
  ctx: QueueContext,
): Promise<QueueFile | null> {
  const json = await deps.readQueue?.(ctx.item.id).catch(() => null);
  if (!json) return null;
  try {
    const q = JSON.parse(json) as QueueFile;
    return q.key === ctx.key && q.segments.length === ctx.content.sentences.length ? q : null;
  } catch {
    return null;
  }
}

/**
 * Opens a document in the player and starts narrating. A queue cached from an earlier build is used as is;
 * otherwise only the sentences around the start are built before narration begins, and the rest are built
 * in steps that yield to the UI (a long book took minutes to build in one go on a phone), then cached.
 */
export async function startDocument(
  deps: SessionDeps,
  documentId: string,
  settings: SessionSettings,
  opts: { autoplay?: boolean; at?: number } = {},
): Promise<SessionPlan> {
  const build = nextBuild(documentId);
  const ctx = queueContext(deps.db, documentId, settings);
  const start = startPoint(deps.db, ctx, settings, opts.at);
  const cached = await cachedQueue(deps, ctx);
  const count = ctx.content.sentences.length;
  const queue =
    cached ??
    partialQueueFile(
      ctx.meta,
      ctx.content.chapters,
      ctx.content.sentences,
      buildRange(ctx, start.startIndex, start.startIndex + QUEUE_WINDOW),
      count,
    );
  const path = await deps.writeQueue(documentId, forPlayer(queue));
  deps.store.getState().setQueue(queue);
  await deps.engine.loadQueue(path, start.startIndex, start.startMs, start.speed, start.quality);
  markOpened(deps.db, documentId, deps.now?.() ?? Date.now());
  if (opts.autoplay ?? true) await deps.engine.play();
  const plan = { queue, ...start };
  if (cached) return plan;
  const complete = await fillQueue(deps, ctx, queue, start.startIndex + QUEUE_WINDOW, build);
  return complete ? { ...plan, queue: complete } : plan;
}

/**
 * Builds the sentences still pending, from `from` to the end and then from the start, a chunk at a time, and
 * hands each chunk to the player and the store. Returns the finished queue (also cached), or null when a
 * newer build of this document took over.
 */
async function fillQueue(
  deps: SessionDeps,
  ctx: QueueContext,
  first: QueueFile,
  from: number,
  build: number,
): Promise<QueueFile | null> {
  const count = ctx.content.sentences.length;
  const yieldToUi = deps.yieldToUi ?? defaultYield;
  const ranges: [number, number][] = [];
  for (let a = Math.max(0, from); a < count; a += QUEUE_CHUNK)
    ranges.push([a, Math.min(count, a + QUEUE_CHUNK)]);
  const head = Math.min(count, Math.max(0, from - QUEUE_WINDOW));
  for (let a = 0; a < head; a += QUEUE_CHUNK) ranges.push([a, Math.min(head, a + QUEUE_CHUNK)]);
  let queue = first;
  for (const [a, b] of ranges) {
    await yieldToUi();
    if (builds.get(ctx.item.id) !== build) return null;
    const segments = buildRange(ctx, a, b).filter((s) => queue.segments[s.i]?.pending);
    if (!segments.length) continue;
    queue = withSegments(queue, segments);
    // Only while this book is the one loaded: a closed or replaced player has nothing to fill.
    if (deps.store.getState().queue?.docId === ctx.item.id) {
      deps.store.getState().setQueue(queue);
      await deps.engine.fillSegments?.(forPlayer(queue, segments));
    }
  }
  if (!isComplete(queue)) return null;
  const done = { ...queue, key: ctx.key };
  await deps.writeQueue(ctx.item.id, forPlayer(done));
  return done;
}

/**
 * Builds and caches a document's whole queue in the background (after import), so the first open needs no
 * building at all. Stops quietly when the book is opened meanwhile (opening builds it itself).
 */
export async function prepareQueue(
  deps: Pick<SessionDeps, 'db' | 'writeQueue' | 'readQueue' | 'yieldToUi' | 'store'>,
  documentId: string,
  settings: SessionSettings,
): Promise<boolean> {
  const build = nextBuild(documentId);
  const ctx = queueContext(deps.db, documentId, settings);
  if (await cachedQueue(deps, ctx)) return true;
  const empty = partialQueueFile(
    ctx.meta,
    ctx.content.chapters,
    ctx.content.sentences,
    [],
    ctx.content.sentences.length,
  );
  const done = await fillQueue(
    { ...deps, engine: { loadQueue: async () => undefined, play: async () => undefined } },
    ctx,
    empty,
    0,
    build,
  );
  return done !== null;
}

/**
 * Saves the listening position whenever a new sentence starts or playback pauses, with the time listened
 * since the last save. Returns an unsubscribe function.
 */
export function trackPosition(
  db: Db,
  store: StoreApi<PlayerMirror>,
  now: () => number = Date.now,
): () => void {
  let playingSince: number | null = null;
  return store.subscribe((m, prev) => {
    const docId = m.native.docId ?? m.queue?.docId;
    if (!docId) return;
    const t = now();
    const sentenceChanged = m.progress.index !== prev.progress.index;
    const paused = prev.native.playing && !m.native.playing;
    if (m.native.playing && playingSince === null) playingSince = t;
    if (!sentenceChanged && !paused) return;
    const listened = playingSince === null ? 0 : t - playingSince;
    playingSince = m.native.playing ? t : null;
    const index = m.progress.index;
    const offsetMs = paused ? m.progress.positionMs : 0;
    savePosition(
      db,
      docId,
      {
        sentenceOrd: index,
        offsetMs,
        progress: m.timeline?.progress(index, offsetMs) ?? 0,
        listenedDeltaMs: listened,
      },
      t,
    );
  });
}

export interface RevoiceDeps {
  db: Db;
  store: StoreApi<PlayerMirror>;
  engine: {
    updateSegments(json: string): Promise<void>;
    setQuality(quality: Quality): Promise<void>;
  };
  /** Caches the rebuilt queue so the next open needs no building. */
  writeQueue?(docId: string, json: string): Promise<string>;
  yieldToUi?(): Promise<void>;
}

/**
 * Changes the narrator for one document while it plays (R-PL-5): the choice is saved on the document, and
 * every sentence after the one being heard is re-queued with the new voice, so it takes effect at the next
 * sentence with no gap. Cast voices follow the new narrator.
 */
export async function changeVoice(
  deps: RevoiceDeps,
  documentId: string,
  voice: string,
  settings: SessionSettings,
  current: number,
): Promise<void> {
  updateSettings(deps.db, documentId, { voice });
  await requeue(deps, documentId, settings, current);
}

/**
 * Rebuilds the queue after a change to how a document is voiced (narrator, a character's voice, merged
 * characters) and hands the engine every sentence after the one being heard, so it applies with no gap.
 */
export async function requeue(
  deps: RevoiceDeps,
  documentId: string,
  settings: SessionSettings,
  current: number,
): Promise<void> {
  // Built a chunk at a time from the next sentence on, so the change is heard at once and the screen never
  // freezes; then the sentences before, so the app's copy (and the cache) match.
  const build = nextBuild(documentId);
  const ctx = queueContext(deps.db, documentId, settings);
  const count = ctx.content.sentences.length;
  const yieldToUi = deps.yieldToUi ?? defaultYield;
  const prior = deps.store.getState().queue;
  let queue =
    prior?.docId === documentId && prior.segments.length === count
      ? prior
      : partialQueueFile(ctx.meta, ctx.content.chapters, ctx.content.sentences, [], count);
  const ranges: [number, number][] = [];
  for (let a = current + 1; a < count; a += QUEUE_CHUNK) ranges.push([a, Math.min(count, a + QUEUE_CHUNK)]);
  for (let a = 0; a <= Math.min(current, count - 1); a += QUEUE_CHUNK)
    ranges.push([a, Math.min(current + 1, count, a + QUEUE_CHUNK)]);
  for (const [k, [a, b]] of ranges.entries()) {
    if (k > 0) await yieldToUi();
    if (builds.get(documentId) !== build) return;
    const segments = buildRange(ctx, a, b);
    queue = withSegments(queue, segments);
    deps.store.getState().setQueue(queue);
    if (a > current) await deps.engine.updateSegments(forPlayer(queue, segments));
  }
  if (isComplete(queue)) await deps.writeQueue?.(documentId, forPlayer({ ...queue, key: ctx.key }));
}

/** Gives one character its own voice (null: back to the automatic choice) and applies it from the next sentence. */
export async function changeCharacterVoice(
  deps: RevoiceDeps,
  documentId: string,
  characterId: string,
  voice: string | null,
  settings: SessionSettings,
  current: number,
): Promise<void> {
  setCharacterVoice(deps.db, documentId, characterId, voice);
  await requeue(deps, documentId, settings, current);
}

/** Merges two names for one character ("Lizzy" into "Elizabeth"), then re-voices what follows. */
export async function mergeCharactersAndRequeue(
  deps: RevoiceDeps,
  documentId: string,
  from: string,
  into: string,
  settings: SessionSettings,
  current: number,
): Promise<void> {
  mergeCharacters(deps.db, documentId, from, into);
  await requeue(deps, documentId, settings, current);
}

/** Sets who speaks sentence `ord` (null: no one in particular), then re-voices what follows. */
export async function correctSpeakerAndRequeue(
  deps: RevoiceDeps,
  documentId: string,
  ord: number,
  characterId: string | null,
  settings: SessionSettings,
  current: number,
): Promise<boolean> {
  const done = correctSpeaker(deps.db, documentId, ord, characterId);
  if (done) await requeue(deps, documentId, settings, current);
  return done;
}

/** Changes the quality for one document: saved on it, and applied by the engine from the next sentence. */
export async function changeQuality(
  deps: Pick<RevoiceDeps, 'db' | 'engine'>,
  documentId: string,
  quality: Quality,
): Promise<void> {
  updateSettings(deps.db, documentId, { quality });
  await deps.engine.setQuality(quality);
}

export interface CleanReadRow {
  reason: Exclude<SkipReason, 'custom'>;
  count: number;
  examples: string[];
  on: boolean;
}

/**
 * The Clean Read review (R-CR-4): what each detector found in this document, with two examples, and whether
 * it's skipping. The listener's own skip phrases are always applied, so they aren't listed.
 */
export function cleanReadRows(
  item: LibraryItem,
  content: Pick<DocumentContent, 'blocks'>,
  speakUrls: boolean,
): CleanReadRow[] {
  const settings = cleanSettingsFor(item, { blocks: content.blocks } as DocumentContent, speakUrls);
  return cleanReport({ meta: { title: item.title, kind: item.kind }, chapters: [], blocks: content.blocks })
    .filter((r): r is CleanReport & { reason: CleanReadRow['reason'] } => r.reason !== 'custom')
    .map((r) => ({ ...r, on: settings[r.reason] }));
}

/** Turns one Clean Read detector on or off for this document and applies it from the next sentence. */
export async function changeCleanRead(
  deps: RevoiceDeps,
  documentId: string,
  reason: CleanReadRow['reason'],
  on: boolean,
  settings: SessionSettings,
  current: number,
): Promise<void> {
  const item = getItem(deps.db, documentId);
  updateSettings(deps.db, documentId, { clean: { ...(item?.settings.clean ?? {}), [reason]: on } });
  await requeue(deps, documentId, settings, current);
}
