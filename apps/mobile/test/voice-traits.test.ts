import { VOICE_CATALOG } from '@lamplight/core';
import { describe, expect, it } from 'vitest';
import { voiceTraits } from '../src/onboarding/voiceTraits';

const byId = (id: string) => {
  const v = VOICE_CATALOG.find((x) => x.id === id);
  if (!v) throw new Error(id);
  return v;
};

describe('voiceTraits', () => {
  it('describes pitch within the voice’s own gender', () => {
    expect(voiceTraits(byId('M2')).pitch).toBe('low'); // 84 Hz, lowest male
    expect(voiceTraits(byId('M1')).pitch).toBe('high'); // 133 Hz, highest male
    expect(voiceTraits(byId('F4')).pitch).toBe('high'); // 199 Hz, highest female
    expect(voiceTraits(byId('F5')).pitch).toBe('low'); // 156 Hz, lowest female
  });

  it('describes pace across all voices', () => {
    expect(voiceTraits(byId('F3')).pace).toBe('unhurried'); // slowest
    expect(voiceTraits(byId('M3')).pace).toBe('brisk'); // fastest
  });

  it('gives every voice one word for each', () => {
    for (const v of VOICE_CATALOG) {
      const t = voiceTraits(v);
      expect(['low', 'medium', 'high']).toContain(t.pitch);
      expect(['unhurried', 'steady', 'brisk']).toContain(t.pace);
    }
  });
});
