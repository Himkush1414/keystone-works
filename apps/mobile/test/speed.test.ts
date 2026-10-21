import { describe, expect, it } from 'vitest';
import { formatSpeed, nextSpeed, SPEED_STOPS } from '../src/player/speed';

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

describe('formatSpeed', () => {
  it('uses the locale decimal separator', () => {
    expect(formatSpeed('en', 1.25)).toBe('1.25×');
    expect(formatSpeed('de', 1.25)).toBe('1,25×');
    expect(formatSpeed('en', 2)).toBe('2×');
  });
});
