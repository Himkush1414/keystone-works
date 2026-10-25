import type { ReaderThemeName } from '@lamplight/tokens';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Locale } from '@/i18n/translate';
import type { ReaderFont } from '@/theme/fonts';
import type { MotionPreference, ThemePreference } from '@/theme/theme';

export type QualityPreference = 'auto' | 'live' | 'studio' | 'studioPlus';
export type CastModePreference = 'off' | 'dialogue' | 'full';

export interface Settings {
  onboarded: boolean;
  theme: ThemePreference;
  motion: MotionPreference;
  locale: Locale | 'system';
  defaultSpeed: number;
  /** Default narrator voice per language code. */
  voices: Partial<Record<string, string>>;
  quality: QualityPreference;
  castMode: CastModePreference;
  haptics: boolean;
  sounds: boolean;
  rewindOnResume: boolean;
  autoAdvance: boolean;
  readerTheme: ReaderThemeName | 'auto';
  readerFont: ReaderFont;
  readerSize: number;
  readerLineHeight: number;
  lineFocus: boolean;
  /** Skipped spans are dimmed in the reader (true) or hidden (false). */
  showSkipped: boolean;
  speakUrls: boolean;
  /** Whispers, shouts, reveal beats and pauses between speakers. */
  expressive: boolean;
  /** Emotion processing: pitch shifts after the voice speaks. Off is Natural, the voice exactly as the model speaks it. */
  voiceProcessing: boolean;
  /** A soft breath before long sentences and emotional moments. */
  breaths: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  theme: 'system',
  motion: 'system',
  locale: 'system',
  defaultSpeed: 1,
  voices: {},
  quality: 'studioPlus', // highest by default; lighter levels are opt-in
  castMode: 'full',
  haptics: true,
  sounds: false,
  rewindOnResume: true,
  autoAdvance: true,
  readerTheme: 'auto',
  readerFont: 'literata',
  readerSize: 19,
  readerLineHeight: 1.58,
  lineFocus: false,
  showSkipped: true,
  speakUrls: true,
  expressive: true,
  breaths: true,
  voiceProcessing: false,
};

/** Where settings are kept: SQLite on devices, localStorage on the web, memory in tests. */
export interface SettingsBackend {
  load(): Partial<Settings> | null;
  save(settings: Settings): void;
}

export interface SettingsState extends Settings {
  hydrated: boolean;
  hydrate(): void;
  update(patch: Partial<Settings>): void;
  reset(): void;
}

const clampSettings = (s: Settings): Settings => ({
  ...s,
  defaultSpeed: Math.min(3, Math.max(0.5, Math.round(s.defaultSpeed * 20) / 20)),
  readerSize: Math.min(32, Math.max(14, Math.round(s.readerSize))),
  readerLineHeight: Math.min(1.9, Math.max(1.35, Math.round(s.readerLineHeight * 100) / 100)),
});

/** Keeps only known keys with the right types, so a damaged or older store can't break the app. */
export function sanitize(raw: unknown): Partial<Settings> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Partial<Settings> = {};
  const src = raw as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const v = src[key];
    const d = DEFAULT_SETTINGS[key];
    if (v === undefined || v === null) continue;
    if (typeof d === 'object' ? typeof v === 'object' && !Array.isArray(v) : typeof v === typeof d) {
      (out as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}

export function createSettingsStore(backend: SettingsBackend): StoreApi<SettingsState> {
  const pick = (s: SettingsState): Settings => {
    const out = {} as Record<string, unknown>;
    for (const k of Object.keys(DEFAULT_SETTINGS)) out[k] = s[k as keyof Settings];
    return out as unknown as Settings;
  };
  return createStore<SettingsState>()((set, get) => ({
    ...DEFAULT_SETTINGS,
    hydrated: false,
    hydrate() {
      let loaded: Partial<Settings>;
      try {
        loaded = sanitize(backend.load());
      } catch {
        loaded = {};
      }
      set({ ...clampSettings({ ...DEFAULT_SETTINGS, ...loaded }), hydrated: true });
    },
    update(patch) {
      const next = clampSettings({ ...pick(get()), ...sanitize(patch) });
      set(next);
      try {
        backend.save(next);
      } catch {
        // Persisting is best effort; the in-memory value still applies for this session.
      }
    },
    reset() {
      set({ ...DEFAULT_SETTINGS });
      backend.save(DEFAULT_SETTINGS);
    },
  }));
}
