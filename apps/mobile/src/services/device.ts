import { Directory, File, Paths } from 'expo-file-system';
import LamplightEngine from '../../modules/lamplight-engine';
import { getDb } from '../data/expoDb';
import { uriToPath } from '../import/paths';
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

/** The app's services on this device, created on first use. */
export function deviceServices(): Services {
  services ??= createServices(getDb(), LamplightEngine);
  return services;
}

/** Opens a document in the player and starts narrating it. */
export function playDocument(s: Services, documentId: string): ReturnType<typeof startDocument> {
  return startDocument(
    { db: s.db, store: s.player, engine: LamplightEngine, writeQueue },
    documentId,
    s.settings.getState(),
  );
}
