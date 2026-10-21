import type { VoiceTraits } from './voices';

export interface BuiltInVoice extends VoiceTraits {
  /** Median speaking pitch in Hz, measured from the engine's own output. */
  pitchHz: number;
  /** Speaking pace at the default rate, in characters per second. */
  charsPerSecond: number;
}

// Measured with tooling/scripts/voice-traits.mjs (supertonic3-int8-v1, English, 8 steps, three sentences).
const MEASURED: readonly Omit<BuiltInVoice, 'pitch'>[] = [
  { id: 'F1', gender: 'f', pitchHz: 179, charsPerSecond: 14.8 },
  { id: 'F2', gender: 'f', pitchHz: 185, charsPerSecond: 15.8 },
  { id: 'F3', gender: 'f', pitchHz: 164, charsPerSecond: 14.3 },
  { id: 'F4', gender: 'f', pitchHz: 199, charsPerSecond: 17.2 },
  { id: 'F5', gender: 'f', pitchHz: 156, charsPerSecond: 15.3 },
  { id: 'M1', gender: 'm', pitchHz: 133, charsPerSecond: 14.7 },
  { id: 'M2', gender: 'm', pitchHz: 84, charsPerSecond: 15.1 },
  { id: 'M3', gender: 'm', pitchHz: 99, charsPerSecond: 17.6 },
  { id: 'M4', gender: 'm', pitchHz: 116, charsPerSecond: 15.8 },
  { id: 'M5', gender: 'm', pitchHz: 89, charsPerSecond: 14.8 },
];

const LOW_HZ = 80;
const HIGH_HZ = 220;

/** Pitch on a 0..1 scale between 80 and 220 Hz, logarithmic like hearing. */
export function relativePitch(hz: number): number {
  const t = Math.log(hz / LOW_HZ) / Math.log(HIGH_HZ / LOW_HZ);
  return Math.round(Math.min(1, Math.max(0, t)) * 100) / 100;
}

/** The ten voices in the bundled model, with traits Cast uses to keep characters apart. */
export const VOICE_CATALOG: readonly BuiltInVoice[] = MEASURED.map((v) => ({
  ...v,
  pitch: relativePitch(v.pitchHz),
}));

/** The narrator Lamplight starts with; device calibration (PlaybackController.calibrate) also uses it. */
export const DEFAULT_NARRATOR = 'F1';

const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
};

/**
 * The three voices offered first (feature spec F1.5): a balanced female voice, a balanced male voice, and a
 * warm, slow one. "Balanced" is the voice nearest its gender's mean pitch among those with an ordinary pace
 * (within 1 character a second of the median); "warm and slow" is the slowest of the rest.
 */
export function recommendedVoices(catalog: readonly BuiltInVoice[] = VOICE_CATALOG): BuiltInVoice[] {
  const pace = median(catalog.map((v) => v.charsPerSecond));
  const ordinary = catalog.filter((v) => Math.abs(v.charsPerSecond - pace) <= 1);
  const balanced = (gender: 'f' | 'm') => {
    const group = catalog.filter((v) => v.gender === gender);
    const mean = group.reduce((sum, v) => sum + v.pitchHz, 0) / (group.length || 1);
    return ordinary
      .filter((v) => v.gender === gender)
      .sort((a, b) => Math.abs(a.pitchHz - mean) - Math.abs(b.pitchHz - mean) || a.id.localeCompare(b.id))[0];
  };
  const picks = [balanced('f'), balanced('m')].filter((v): v is BuiltInVoice => v !== undefined);
  const slow = catalog
    .filter((v) => !picks.includes(v))
    .sort((a, b) => a.charsPerSecond - b.charsPerSecond || a.id.localeCompare(b.id))[0];
  return slow ? [...picks, slow] : picks;
}
