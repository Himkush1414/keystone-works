import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import LamplightEngine from '../../modules/lamplight-engine';
import { getDb } from '../data/expoDb';
import { getSetting, setSetting } from '../data/userdata';
import { uriToPath } from '../import/paths';
import { scheduleCalibration } from '../player/calibration';
import { startDocument } from '../player/session';
import { createServices, type Services } from './services';

/** Queue files live in the cache: they are rebuilt from the library whenever a document is opened. */
async function writeQueue(docId: string, json: string): Promise<string> {
  const dir = new Directory(Paths.cache, 'queues');
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, `${docId}.json`);
  await file.write(json);
  return uriToPath(file.uri);
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
    { db: s.db, store: s.player, engine: LamplightEngine, writeQueue },
    documentId,
    s.settings.getState(),
    opts,
  );
}
