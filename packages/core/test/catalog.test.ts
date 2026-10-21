import { describe, expect, it } from 'vitest';
import { assignVoices, DEFAULT_NARRATOR, relativePitch, VOICE_CATALOG } from '../src';

describe('voice catalog', () => {
  it('lists the ten bundled voices once each', () => {
    expect(VOICE_CATALOG.map((v) => v.id)).toEqual([
      'F1',
      'F2',
      'F3',
      'F4',
      'F5',
      'M1',
      'M2',
      'M3',
      'M4',
      'M5',
    ]);
    expect(VOICE_CATALOG.some((v) => v.id === DEFAULT_NARRATOR)).toBe(true);
  });

  it('places every female voice above every male voice in measured pitch', () => {
    const lowestF = Math.min(...VOICE_CATALOG.filter((v) => v.gender === 'f').map((v) => v.pitch));
    const highestM = Math.max(...VOICE_CATALOG.filter((v) => v.gender === 'm').map((v) => v.pitch));
    expect(lowestF).toBeGreaterThan(highestM);
  });

  it('agrees with the 15 characters per second the players estimate durations with', () => {
    const mean = VOICE_CATALOG.reduce((s, v) => s + v.charsPerSecond, 0) / VOICE_CATALOG.length;
    expect(mean).toBeGreaterThan(14);
    expect(mean).toBeLessThan(17);
  });

  it('gives a female narrator a contrasting male dialogue voice', () => {
    const a = assignVoices([], DEFAULT_NARRATOR, VOICE_CATALOG);
    expect(VOICE_CATALOG.find((v) => v.id === a.dialogue)?.gender).toBe('m');
  });
});

describe('relativePitch', () => {
  it('maps 80–220 Hz onto 0–1 on a log scale and clamps outside it', () => {
    expect(relativePitch(80)).toBe(0);
    expect(relativePitch(220)).toBe(1);
    expect(relativePitch(Math.sqrt(80 * 220))).toBe(0.5);
    expect(relativePitch(40)).toBe(0);
    expect(relativePitch(400)).toBe(1);
  });
});
