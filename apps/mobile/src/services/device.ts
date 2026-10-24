import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import LamplightEngine from '../../modules/lamplight-engine';
import { getDb } from '../data/expoDb';
import { getSetting, setSetting } from '../data/userdata';
import { uriToPath } from '../import/paths';
import { scheduleCalibration } from '../player/calibration';
import { prepareQueue, startDocument } from '../player/session';
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
