import {
  assignVoices,
  buildQueue,
  DEFAULT_NARRATOR,
  defaultCleanSettings,
  VOICE_CATALOG,
  type CastMode,
  type CleanSettings,
  type QueueOptions,
} from '@lamplight/core';
import type { StoreApi } from 'zustand/vanilla';
import type { Quality, QueueFile } from '../../modules/lamplight-engine/src/types';
import { loadContent, mergeCharacters, setCharacterVoice, type DocumentContent } from '../data/content';
import type { Db } from '../data/db';
import { getItem, markOpened, updateSettings, type LibraryItem } from '../data/library';
import { getPosition, rulesFor, savePosition } from '../data/userdata';
import type { Settings } from '../state/settings';
import { toQueueFile } from './queue';
import type { PlayerMirror } from './store';

export type SessionSettings = Pick<
  Settings,
  'castMode' | 'quality' | 'defaultSpeed' | 'voices' | 'speakUrls' | 'rewindOnResume'
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

/** Everything the native player needs to narrate `documentId` from where the listener left off. */
export function planSession(
  db: Db,
  documentId: string,
  settings: SessionSettings,
  /** Start at this sentence instead of the saved position (a search result). */
  at?: number,
): SessionPlan {
  const item = getItem(db, documentId);
  if (!item || item.status !== 'ready') throw new Error(`document ${documentId} is not ready to play`);
  const content = loadContent(db, documentId);

  const narrator = item.settings.voice ?? settings.voices[item.language] ?? DEFAULT_NARRATOR;
  const overrides: Record<string, string> = {};
  for (const c of content.characters) if (c.voiceId) overrides[c.id] = c.voiceId;
  const characters = content.characters.map((c) => ({
    id: c.id,
    name: c.name,
    aliases: c.aliases,
    lines: c.lineCount,
    ...(c.gender ? { gender: c.gender } : {}),
  }));
  const options: QueueOptions = {
    clean: cleanSettingsFor(item, content, settings.speakUrls),
    customSkips: item.settings.customSkips ?? [],
    dictionary: rulesFor(db, documentId),
    assignment: assignVoices(characters, narrator, VOICE_CATALOG, overrides),
    castMode: (item.settings.castMode ?? settings.castMode) as CastMode,
  };
  const segments = buildQueue({ ...content, language: item.language }, options);
  const queue = toQueueFile(
    { docId: item.id, title: item.title, author: item.author, artworkUri: item.coverPath },
    content.chapters,
    content.sentences,
    segments,
  );

  // Resume where the listener stopped, from the start of that sentence (R-PL-9); a finished item restarts.
  const pos = getPosition(db, documentId);
  const finished = item.finishedAt !== null || (pos?.progress ?? 0) >= 1;
  const last = Math.max(0, segments.length - 1);
  const resumeAt = finished || !pos ? 0 : Math.min(pos.sentenceOrd, last);
  const startIndex = at === undefined ? resumeAt : Math.min(Math.max(0, at), last);
  const startMs = at !== undefined || finished || !pos || settings.rewindOnResume ? 0 : pos.offsetMs;
  return {
    queue,
    startIndex,
    startMs,
    speed: item.settings.speed ?? settings.defaultSpeed,
    quality: item.settings.quality ?? settings.quality,
  };
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
  };
  /** Writes the queue JSON where the native player can read it; returns the path. */
  writeQueue(docId: string, json: string): Promise<string>;
  now?(): number;
}

/** Opens a document in the player and starts narrating. */
export async function startDocument(
  deps: SessionDeps,
  documentId: string,
  settings: SessionSettings,
  opts: { autoplay?: boolean; at?: number } = {},
): Promise<SessionPlan> {
  const plan = planSession(deps.db, documentId, settings, opts.at);
  const path = await deps.writeQueue(documentId, JSON.stringify(plan.queue));
  deps.store.getState().setQueue(plan.queue);
  await deps.engine.loadQueue(path, plan.startIndex, plan.startMs, plan.speed, plan.quality);
  markOpened(deps.db, documentId, deps.now?.() ?? Date.now());
  if (opts.autoplay ?? true) await deps.engine.play();
  return plan;
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
  const { queue } = planSession(deps.db, documentId, settings);
  deps.store.getState().setQueue(queue);
  const next = { ...queue, segments: queue.segments.filter((s) => s.i > current) };
  if (next.segments.length) await deps.engine.updateSegments(JSON.stringify(next));
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

/** Changes the quality for one document: saved on it, and applied by the engine from the next sentence. */
export async function changeQuality(
  deps: Pick<RevoiceDeps, 'db' | 'engine'>,
  documentId: string,
  quality: Quality,
): Promise<void> {
  updateSettings(deps.db, documentId, { quality });
  await deps.engine.setQuality(quality);
}
