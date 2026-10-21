import { VOICE_CATALOG, type BuiltInVoice } from '@lamplight/core';

export type PitchWord = 'low' | 'medium' | 'high';
export type PaceWord = 'unhurried' | 'steady' | 'brisk';

/**
 * How a voice sounds, in words a listener uses (R-VO-1): pitch relative to the other voices of its gender,
 * pace relative to all of them, both from the measured catalog.
 */
export function voiceTraits(
  voice: BuiltInVoice,
  catalog: readonly BuiltInVoice[] = VOICE_CATALOG,
): { pitch: PitchWord; pace: PaceWord } {
  const third = (value: number, values: number[]): 0 | 1 | 2 => {
    const sorted = [...values].sort((a, b) => a - b);
    const rank = sorted.indexOf(value) / Math.max(1, sorted.length - 1);
    return rank < 1 / 3 ? 0 : rank > 2 / 3 ? 2 : 1;
  };
  const pitch = third(
    voice.pitchHz,
    catalog.filter((v) => v.gender === voice.gender).map((v) => v.pitchHz),
  );
  const pace = third(
    voice.charsPerSecond,
    catalog.map((v) => v.charsPerSecond),
  );
  return {
    pitch: (['low', 'medium', 'high'] as const)[pitch],
    pace: (['unhurried', 'steady', 'brisk'] as const)[pace],
  };
}
