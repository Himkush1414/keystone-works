import { describe, expect, it } from 'vitest';
import {
  createSettingsStore,
  DEFAULT_SETTINGS,
  sanitize,
  type Settings,
  type SettingsBackend,
} from '../src/state/settings';

function memory(initial: unknown = null): SettingsBackend & { saved: Settings[] } {
  const saved: Settings[] = [];
  return {
    saved,
    load: () => initial as Partial<Settings> | null,
    save: (s) => saved.push(s),
  };
}

describe('settings store', () => {
  it('starts with defaults and hydrates from the backend', () => {
    const store = createSettingsStore(memory({ theme: 'dark', defaultSpeed: 1.25 }));
    expect(store.getState().hydrated).toBe(false);
    store.getState().hydrate();
    expect(store.getState()).toMatchObject({
      hydrated: true,
      theme: 'dark',
      defaultSpeed: 1.25,
      readerFont: 'literata',
    });
  });

  it('persists every update and clamps values to their ranges', () => {
    const backend = memory();
    const store = createSettingsStore(backend);
    store.getState().hydrate();
    store.getState().update({ defaultSpeed: 9, readerSize: 8, readerLineHeight: 1.234 });
    expect(store.getState()).toMatchObject({ defaultSpeed: 3, readerSize: 14, readerLineHeight: 1.35 });
    expect(backend.saved.at(-1)?.defaultSpeed).toBe(3);
    expect(Object.keys(backend.saved.at(-1) ?? {})).not.toContain('hydrated');
  });

  it('keeps line focus off until turned on, then remembers it', () => {
    const backend = memory();
    const store = createSettingsStore(backend);
    store.getState().hydrate();
    expect(store.getState().lineFocus).toBe(false);
    store.getState().update({ lineFocus: true });
    const again = createSettingsStore(memory(backend.saved.at(-1)));
    again.getState().hydrate();
    expect(again.getState().lineFocus).toBe(true);
    expect(sanitize({ lineFocus: 'yes' })).toEqual({});
  });

  it('rounds speed to the 0.05 detents', () => {
    const store = createSettingsStore(memory());
    store.getState().update({ defaultSpeed: 1.333 });
    expect(store.getState().defaultSpeed).toBe(1.35);
  });

  it('ignores damaged stored data and unknown keys', () => {
    const store = createSettingsStore(memory({ theme: 42, voices: ['x'], evil: true, haptics: false }));
    store.getState().hydrate();
    expect(store.getState().theme).toBe('system');
    expect(store.getState().voices).toEqual({});
    expect(store.getState().haptics).toBe(false);
    expect(sanitize('nonsense')).toEqual({});
  });

  it('survives a backend that throws', () => {
    const store = createSettingsStore({
      load: () => {
        throw new Error('disk');
      },
      save: () => {
        throw new Error('disk');
      },
    });
    store.getState().hydrate();
    expect(store.getState().hydrated).toBe(true);
    store.getState().update({ sounds: true });
    expect(store.getState().sounds).toBe(true);
  });

  it('resets to defaults', () => {
    const backend = memory();
    const store = createSettingsStore(backend);
    store.getState().update({ theme: 'dark' });
    store.getState().reset();
    expect(store.getState().theme).toBe(DEFAULT_SETTINGS.theme);
    expect(backend.saved.at(-1)).toEqual(DEFAULT_SETTINGS);
  });
});
