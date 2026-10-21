import type { StoreApi } from 'zustand/vanilla';
import type { LamplightEngineEvents } from '../../modules/lamplight-engine/src/types';
import type { Db } from '../data/db';
import { getSetting, setSetting } from '../data/userdata';
import { trackPosition } from '../player/session';
import { connectEngine, createPlayerStore, type PlayerMirror } from '../player/store';
import { createLibraryStore, type LibraryState } from '../state/library';
import { createToastStore, type ToastState } from '../state/toast';
import {
  createSettingsStore,
  type Settings,
  type SettingsBackend,
  type SettingsState,
} from '../state/settings';

const SETTINGS_KEY = 'app';

/** Settings live in the app database next to everything else, so a backup carries them. */
export function sqliteSettingsBackend(db: Db): SettingsBackend {
  return {
    load: () => getSetting<Partial<Settings> | null>(db, SETTINGS_KEY, null),
    save: (s) => setSetting(db, SETTINGS_KEY, s),
  };
}

export interface EngineEvents {
  addListener<E extends keyof LamplightEngineEvents>(
    event: E,
    listener: LamplightEngineEvents[E],
  ): { remove(): void };
}

/** The long-lived state the screens share. Created once at launch; `dispose` undoes the subscriptions. */
export interface Services {
  db: Db;
  settings: StoreApi<SettingsState>;
  library: StoreApi<LibraryState>;
  player: StoreApi<PlayerMirror>;
  toast: StoreApi<ToastState>;
  dispose(): void;
}

export function createServices(db: Db, engine: EngineEvents, clock?: () => number): Services {
  const settings = createSettingsStore(sqliteSettingsBackend(db));
  settings.getState().hydrate();
  const library = createLibraryStore(db);
  library.getState().refresh();
  const player = createPlayerStore();
  const unsubscribe = [connectEngine(player, engine, clock), trackPosition(db, player)];
  return {
    db,
    settings,
    library,
    player,
    toast: createToastStore(),
    dispose: () => unsubscribe.forEach((u) => u()),
  };
}
