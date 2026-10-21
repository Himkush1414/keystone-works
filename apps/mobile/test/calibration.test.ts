import { describe, expect, it } from 'vitest';
import { scheduleCalibration, STEADY_MS } from '../src/player/calibration';
import { createPlayerStore, IDLE } from '../src/player/store';

function setup(opts: { calibratedFor?: string | null; fail?: number } = {}) {
  const store = createPlayerStore();
  let t = 0;
  let saved = opts.calibratedFor ?? null;
  let failures = opts.fail ?? 0;
  const calls: number[] = [];
  const stop = scheduleCalibration(store, {
    fingerprint: 'pixel/15/abc',
    calibratedFor: () => saved,
    remember: (f) => (saved = f),
    calibrate: () => {
      calls.push(t);
      return failures-- > 0 ? Promise.reject(new Error('busy')) : Promise.resolve({});
    },
    now: () => t,
  });
  const at = (ms: number, playing = true, buffering = false) => {
    t = ms;
    store.getState().onState({ ...IDLE, docId: 'd', playing, buffering, index: ms }, ms);
  };
  return { at, calls, saved: () => saved, stop };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('scheduleCalibration', () => {
  it('runs once playback has been steady for 20 s, and remembers the device', async () => {
    const c = setup();
    c.at(0);
    c.at(STEADY_MS - 1);
    expect(c.calls).toEqual([]);
    c.at(STEADY_MS);
    await flush();
    expect(c.calls).toEqual([STEADY_MS]);
    expect(c.saved()).toBe('pixel/15/abc');
    c.at(STEADY_MS * 3);
    expect(c.calls).toHaveLength(1);
  });

  it('starts the 20 s over after a pause or while buffering', () => {
    const c = setup();
    c.at(0);
    c.at(15_000, false);
    c.at(16_000);
    c.at(30_000, true, true);
    c.at(31_000);
    c.at(31_000 + STEADY_MS - 1);
    expect(c.calls).toEqual([]);
  });

  it('does nothing when this device and OS build were already measured', () => {
    const c = setup({ calibratedFor: 'pixel/15/abc' });
    c.at(0);
    c.at(STEADY_MS * 2);
    expect(c.calls).toEqual([]);
  });

  it('tries again on a later steady stretch when calibration fails', async () => {
    const c = setup({ fail: 1 });
    c.at(0);
    c.at(STEADY_MS);
    await flush();
    expect(c.saved()).toBeNull();
    c.at(STEADY_MS + 1);
    c.at(STEADY_MS * 2 + 1);
    await flush();
    expect(c.calls).toHaveLength(2);
    expect(c.saved()).toBe('pixel/15/abc');
  });
});
