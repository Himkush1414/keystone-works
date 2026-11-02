import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import LamplightEngine from '../../modules/lamplight-engine';
import type { ExportEvent } from '../../modules/lamplight-engine/src/types';
import { getItem } from '../data/library';
import { getDb } from '../data/expoDb';
import { getSetting, setSetting } from '../data/userdata';
import { refreshBundledSamples } from '../import/device';
import { uriToPath } from '../import/paths';
import { scheduleCalibration } from '../player/calibration';
import { exportPlan, playlist } from '../player/export';
import { forPlayer } from '../player/queue';
import { prepareQueue, startDocument, wholeQueue } from '../player/session';
import { createServices, type Services } from './services';

/** Queue files live in the cache: they are rebuilt from the library whenever a document is opened. */
function queueFile(docId: string): File {
  const dir = new Directory(Paths.cache, 'queues');
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, `${docId}.json`);
}

async function writeQueue(docId: string, json: string): Promise<string> {
  const file = queueFile(docId);
  await file.write(json);
  return uriToPath(file.uri);
}

async function readQueue(docId: string): Promise<string | null> {
  const file = queueFile(docId);
  return file.exists ? file.text() : null;
}

let services: Services | null = null;

/** Android's build fingerprint changes with every OS update, which is when calibration should run again. */
function deviceFingerprint(): string {
  const c = Platform.constants as { Fingerprint?: string; Model?: string; Release?: string };
  return c.Fingerprint ?? `${c.Model ?? Platform.OS}/${c.Release ?? String(Platform.Version)}`;
}

/** The app's services on this device, created on first use. */
export function deviceServices(): Services {
  if (services) return services;
  const db = getDb();
  services = createServices(db, LamplightEngine);
  scheduleCalibration(services.player, {
    fingerprint: deviceFingerprint(),
    calibratedFor: () => getSetting<string | null>(db, 'calibratedFor', null),
    remember: (f) => setSetting(db, 'calibratedFor', f),
    calibrate: () => LamplightEngine.calibrate(),
    now: Date.now,
  });
  const created = services;
  // Samples added by an older version get their text again (the app has it); the library shows the result.
  refreshBundledSamples(db)
    .then((ids) => {
      if (ids.length) created.library.getState().refresh();
    })
    .catch((e: unknown) => console.warn('sample refresh failed', e));
  return services;
}

/** Opens a document in the player and starts narrating it. */
export function playDocument(
  s: Services,
  documentId: string,
  opts: { autoplay?: boolean; at?: number } = {},
): ReturnType<typeof startDocument> {
  return startDocument(
    { db: s.db, store: s.player, engine: LamplightEngine, writeQueue, readQueue },
    documentId,
    s.settings.getState(),
    opts,
  );
}

/**
 * Builds a newly imported document's queue in the background, so opening it needs no building. Failures are
 * harmless (opening builds the queue itself), so they're only logged.
 */
export function prepareQueueSoon(s: Services, documentId: string): void {
  prepareQueue({ db: s.db, store: s.player, writeQueue, readQueue }, documentId, s.settings.getState()).catch(
    (e: unknown) => console.warn('queue prebuild failed', e),
  );
}

/** For re-voicing: the rebuilt queue is cached for the next open. */
export const queueCache = { writeQueue, readQueue };

export interface ExportOutcome {
  folder: string;
  files: number;
  durationMs: number;
}

/** An export that couldn't start or finish; `code` picks the words (see errors.export* in the catalogs). */
export class ExportFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Audio export (R-EX-1): the listener picks a folder; a folder named after the book gets one M4A per chapter
 * (or only `chapter`) and an M3U playlist. Cached audio is reused, the rest is rendered; the engine gives way
 * to narration. Resolves null when the folder picker was closed; a failed or cancelled export removes what it
 * wrote.
 */
export async function exportDocument(
  s: Services,
  documentId: string,
  opts: { chapter?: number },
  onProgress: (e: ExportEvent) => void,
): Promise<ExportOutcome | null> {
  const settings = s.settings.getState();
  const queue = await wholeQueue({ db: s.db, readQueue, yieldToUi: nextFrame }, documentId, settings);
  const plan = exportPlan(queue, opts);
  if (!plan.tracks.length) throw new ExportFailure('export-empty', 'nothing to export');
  let picked: Directory;
  try {
    picked = await Directory.pickDirectoryAsync();
  } catch {
    return null;
  }
  const folder = picked.createDirectory(plan.folder);
  try {
    const tracks = plan.tracks.map((t) => ({
      uri: folder.createFile(t.file, 'audio/mp4').uri,
      from: t.from,
      to: t.to,
    }));
    const path = await writeQueue(`${documentId}-export`, forPlayer(queue));
    const quality = getItem(s.db, documentId)?.settings.quality ?? settings.quality;
    const sub = LamplightEngine.addListener('onExport', onProgress);
    let lengths: number[];
    try {
      lengths = await LamplightEngine.exportAudio(path, JSON.stringify(tracks), quality);
    } finally {
      sub.remove();
    }
    await folder.createFile(plan.playlist, 'audio/x-mpegurl').write(playlist(plan, queue, lengths));
    return { folder: folder.name, files: tracks.length, durationMs: lengths.reduce((a, b) => a + b, 0) };
  } catch (e) {
    try {
      folder.delete();
    } catch {
      // Already gone, or the folder can't be written at all; nothing more to undo.
    }
    const code = (e as { code?: unknown }).code;
    throw new ExportFailure(typeof code === 'string' ? code : 'export-failed', String(e));
  }
}

/** Stops the export under way; its promise rejects with "export-cancelled". */
export const cancelExport = () => LamplightEngine.cancelExport();
