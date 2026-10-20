import type { Character, Gender } from './attribute';

export interface VoiceTraits {
  id: string;
  gender: Gender;
  /** Relative pitch, 0 (lowest) to 1 (highest). */
  pitch: number;
}

export type CastMode = 'off' | 'dialogue' | 'full';

export interface CastAssignment {
  narrator: string;
  dialogue: string;
  byCharacter: Record<string, string>;
}

/** Minimum attribution confidence before a line uses a character's own voice. */
export const NAMED_VOICE_CONFIDENCE = 0.7;

/**
 * Chooses voices: the dialogue voice contrasts with the narrator; characters (most lines first) get distinct
 * voices matching their gender when known; user overrides always win.
 */
export function assignVoices(
  characters: readonly Character[],
  narrator: string,
  catalog: readonly VoiceTraits[],
  overrides: Readonly<Record<string, string>> = {},
): CastAssignment {
  const byId = new Map(catalog.map((v) => [v.id, v]));
  const n = byId.get(narrator) ?? catalog[0];
  if (!n) return { narrator, dialogue: narrator, byCharacter: {} };
  const others = catalog.filter((v) => v.id !== n.id);
  const distance = (v: VoiceTraits) => Math.abs(v.pitch - n.pitch) + (v.gender === n.gender ? 0 : 0.5);
  const dialogue =
    overrides['__dialogue'] ??
    [...others].sort((a, b) => distance(b) - distance(a) || a.id.localeCompare(b.id))[0]?.id ??
    n.id;

  const uses = new Map<string, number>(catalog.map((v) => [v.id, 0]));
  uses.set(n.id, Number.POSITIVE_INFINITY); // never reuse the narrator for a character
  const byCharacter: Record<string, string> = {};
  for (const c of characters) {
    const forced = overrides[c.id];
    if (forced && byId.has(forced)) {
      byCharacter[c.id] = forced;
      uses.set(forced, (uses.get(forced) ?? 0) + 1);
      continue;
    }
    const pool = others.filter((v) => !c.gender || v.gender === c.gender);
    const candidates = (pool.length ? pool : others).sort(
      (a, b) =>
        (uses.get(a.id) ?? 0) - (uses.get(b.id) ?? 0) ||
        distance(b) - distance(a) ||
        a.id.localeCompare(b.id),
    );
    const pick = candidates[0];
    if (!pick) continue;
    byCharacter[c.id] = pick.id;
    uses.set(pick.id, (uses.get(pick.id) ?? 0) + 1);
  }
  return { narrator: n.id, dialogue, byCharacter };
}

/** The voice for a sentence given the cast mode and its attribution. */
export function voiceFor(
  assignment: CastAssignment,
  mode: CastMode,
  kind: 'narration' | 'dialogue' | 'heading',
  speaker?: string,
  confidence = 1,
): string {
  if (mode === 'off' || kind !== 'dialogue') return assignment.narrator;
  if (mode === 'full' && speaker && confidence >= NAMED_VOICE_CONFIDENCE) {
    return assignment.byCharacter[speaker] ?? assignment.dialogue;
  }
  return assignment.dialogue;
}
