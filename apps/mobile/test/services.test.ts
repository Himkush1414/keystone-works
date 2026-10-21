import { describe, expect, it } from 'vitest';
import type { LamplightEngineEvents } from '../modules/lamplight-engine/src/types';
import { getSetting } from '../src/data/userdata';
import { createServices, sqliteSettingsBackend, type EngineEvents } from '../src/services/services';
import { testDb } from './nodeDb';

function fakeEngine() {
  const listeners = new Map<string, unknown>();
  let removed = 0;
  const engine: EngineEvents = {
    addListener<E extends keyof LamplightEngineEvents>(event: E, fn: LamplightEngineEvents[E]) {
      listeners.set(event, fn);
      return { remove: () => void removed++ };
    },
  };
  return { engine, listeners, removed: () => removed };
}

describe('sqliteSettingsBackend', () => {
  it('stores settings in the database and reads them back', () => {
    const db = testDb();
    const backend = sqliteSettingsBackend(db);
    expect(backend.load()).toBeNull();
    const services = createServices(db, fakeEngine().engine);
    services.settings.getState().update({ defaultSpeed: 1.5, theme: 'dark' });
    expect(getSetting<{ defaultSpeed: number }>(db, 'app', { defaultSpeed: 0 }).defaultSpeed).toBe(1.5);
    expect(createServices(db, fakeEngine().engine).settings.getState()).toMatchObject({
      hydrated: true,
      defaultSpeed: 1.5,
      theme: 'dark',
    });
  });
});

describe('createServices', () => {
  it('hydrates settings, loads the library and listens to the engine until disposed', () => {
    const fake = fakeEngine();
    const services = createServices(testDb(), fake.engine, () => 10);
    expect(services.settings.getState().hydrated).toBe(true);
    expect(services.library.getState().items).toEqual([]);
    expect([...fake.listeners.keys()].sort()).toEqual(['onProgress', 'onSentence', 'onState']);
    (fake.listeners.get('onProgress') as LamplightEngineEvents['onProgress'])({ index: 4, positionMs: 20 });
    expect(services.player.getState().progress).toEqual({ index: 4, positionMs: 20, at: 10 });
    services.dispose();
    expect(fake.removed()).toBe(3);
  });
});
