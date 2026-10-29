import { describe, expect, it } from 'vitest';
import { formatSpeed, nextSpeed, SPEED_PRESETS, SPEED_STOPS, stepSpeed } from '../src/player/speed';

describe('nextSpeed', () => {
  it('cycles through the stops and wraps around', () => {
    const seen: number[] = [];
    let s = 1;
    for (let i = 0; i < SPEED_STOPS.length; i++) seen.push((s = nextSpeed(s)));
    expect(seen).toEqual([1.25, 1.5, 2, 0.75, 1]);
  });

  it('moves a speed set elsewhere to the next stop above it', () => {
    expect(nextSpeed(1.1)).toBe(1.25);
    expect(nextSpeed(2.6)).toBe(1);
  });
});

describe('stepSpeed', () => {
  it('moves in 0.05 steps without float drift', () => {
    expect(stepSpeed(1, 1)).toBe(1.05);
    expect(stepSpeed(1.05, -1)).toBe(1);
    let s = 1;
    for (let i = 0; i < 7; i++) s = stepSpeed(s, 1);
    expect(s).toBe(1.35);
  });

  it('stays between 0.5× and 3× and snaps an off-grid speed to the grid', () => {
    expect(stepSpeed(0.5, -1)).toBe(0.5);
    expect(stepSpeed(3, 1)).toBe(3);
    expect(stepSpeed(1.12, 0)).toBe(1.1);
  });

  it('offers presets inside the range, including every stop of the speed button', () => {
    expect(SPEED_PRESETS.every((p) => stepSpeed(p, 0) === p)).toBe(true);
    for (const stop of SPEED_STOPS) expect(SPEED_PRESETS).toContain(stop);
  });
});

describe('formatSpeed', () => {
  it('uses the locale decimal separator', () => {
    expect(formatSpeed('en', 1.25)).toBe('1.25×');
    expect(formatSpeed('de', 1.25)).toBe('1,25×');
    expect(formatSpeed('en', 2)).toBe('2×');
  });
});
