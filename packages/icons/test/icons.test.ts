import { describe, expect, it } from 'vitest';
import { ICON_STROKE, icons } from '../src';

const NUM = /-?\d*\.?\d+/g;

describe('icon set', () => {
  it('has well-formed path data that stays inside the 24-unit grid', () => {
    for (const [name, shapes] of Object.entries(icons)) {
      expect(shapes.length, name).toBeGreaterThan(0);
      for (const { d } of shapes) {
        expect(d, name).toMatch(/^[Mm]/);
        expect(d, name).not.toMatch(/NaN|undefined/);
        // Absolute coordinates after M/L/H/V commands must fit the grid with the stroke's half width.
        for (const m of d.matchAll(/[MLHV]([^A-Za-z]*)/g)) {
          for (const n of (m[1] ?? '').match(NUM) ?? []) {
            const v = Number(n);
            expect(v, `${name}: ${n}`).toBeGreaterThanOrEqual(0);
            expect(v, `${name}: ${n}`).toBeLessThanOrEqual(24);
          }
        }
      }
    }
  });

  it('uses one stroke weight', () => {
    expect(ICON_STROKE).toBe(1.75);
  });

  it('covers the controls the app needs', () => {
    for (const name of [
      'play',
      'pause',
      'skipBack',
      'skipForward',
      'speed',
      'voice',
      'sleep',
      'cast',
      'cleanRead',
      'bookmark',
    ]) {
      expect(icons).toHaveProperty(name);
    }
  });
});
