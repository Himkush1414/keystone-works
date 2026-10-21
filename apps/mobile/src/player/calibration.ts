import type { StoreApi } from 'zustand/vanilla';
import type { PlayerMirror } from './store';

/** Playback must have run this long without a pause before calibrating (feature spec F1.7). */
export const STEADY_MS = 20_000;

export interface CalibrationDeps {
  /** This device and OS build; calibration runs again when it changes. */
  fingerprint: string;
  /** The fingerprint the last calibration ran for, if any. */
  calibratedFor(): string | null;
  remember(fingerprint: string): void;
  calibrate(): Promise<unknown>;
  now(): number;
}

/**
 * Measures the phone once (R-ON-5): after playback has been steady for 20 s, so it never competes with the
 * first sentences or the intro, and again only after an OS update. Returns an unsubscribe function.
 */
export function scheduleCalibration(store: StoreApi<PlayerMirror>, deps: CalibrationDeps): () => void {
  if (deps.calibratedFor() === deps.fingerprint) return () => undefined;
  let playingSince: number | null = null;
  let started = false;
  const check = (m: PlayerMirror) => {
    if (started) return;
    const steady = m.native.playing && !m.native.buffering;
    if (!steady) {
      playingSince = null;
      return;
    }
    const now = deps.now();
    playingSince ??= now;
    if (now - playingSince < STEADY_MS) return;
    started = true;
    deps
      .calibrate()
      .then(() => {
        deps.remember(deps.fingerprint);
        unsubscribe();
      })
      .catch(() => {
        // Try again on a later steady stretch.
        started = false;
        playingSince = null;
      });
  };
  const unsubscribe = store.subscribe(check);
  return unsubscribe;
}
