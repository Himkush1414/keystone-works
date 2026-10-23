import type { Character, Gender } from './attribute';
import type { Age, Temperament } from './profile';

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
  /** Pace for a character's voice relative to normal, when it isn't 1 (an old man unhurried, a child quick). */
  rateByCharacter?: Record<string, number>;
}

/** Minimum attribution confidence before a line uses a character's own voice. */
export const NAMED_VOICE_CONFIDENCE = 0.7;

const AGE_RATE: Record<Age, number> = { old: 0.93, adult: 1, young: 1.02, child: 1.05 };
const TEMPERAMENT_RATE: Record<Temperament, number> = { calm: 0.97, gentle: 0.95, bright: 1.03, fiery: 1.04 };
/** Characters who have to share a voice are told apart by pace: slower, faster, slower… */
const SHARED_RATE = [1, 0.94, 1.06, 0.9, 1.1];

/**
 * Chooses voices: the dialogue voice contrasts with the narrator; characters (most lines first) get distinct
 * voices matching their gender when known, the old a low register and children a high one, with a pace that
 * suits them. User overrides always win; `saved` are earlier automatic choices, kept so that merging
 * characters or adding a dictionary rule never re-casts anyone mid-book.
 */
export function assignVoices(
  characters: readonly Character[],
  narrator: string,
  catalog: readonly VoiceTraits[],
  overrides: Readonly<Record<string, string>> = {},
  saved: Readonly<Record<string, string>> = {},
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
  const take = (id: string, voice: string) => {
    byCharacter[id] = voice;
    uses.set(voice, (uses.get(voice) ?? 0) + 1);
  };
  // Fixed choices first, so automatic ones work around them.
  for (const c of characters) {
    const forced = overrides[c.id];
    const kept = saved[c.id];
    if (forced && byId.has(forced)) take(c.id, forced);
    else if (kept && kept !== n.id && byId.has(kept)) take(c.id, kept);
  }
  for (const c of characters) {
    if (byCharacter[c.id]) continue;
    const pool = others.filter((v) => !c.gender || v.gender === c.gender);
    const group = pool.length ? pool : others;
    const pitches = group.map((v) => v.pitch);
    const low = Math.min(...pitches);
    const high = Math.max(...pitches);
    // The register that suits their age: the lowest voice for the old, the highest for a child.
    const target =
      c.age === 'old'
        ? low
        : c.age === 'child'
          ? high
          : c.age === 'young'
            ? low + (high - low) * 0.75
            : undefined;
    const fit = (v: VoiceTraits) => (target === undefined ? -distance(v) : Math.abs(v.pitch - target));
    const pick = [...group].sort(
      (a, b) => (uses.get(a.id) ?? 0) - (uses.get(b.id) ?? 0) || fit(a) - fit(b) || a.id.localeCompare(b.id),
    )[0];
    if (pick) take(c.id, pick.id);
  }

  const rateByCharacter: Record<string, number> = {};
  const sharing = new Map<string, number>();
  for (const c of characters) {
    const voice = byCharacter[c.id];
    if (!voice) continue;
    const k = sharing.get(voice) ?? 0;
    sharing.set(voice, k + 1);
    const rate =
      (c.age ? AGE_RATE[c.age] : 1) *
      (c.temperament ? TEMPERAMENT_RATE[c.temperament] : 1) *
      (SHARED_RATE[k % SHARED_RATE.length] ?? 1);
    const clamped = Math.round(Math.min(1.12, Math.max(0.86, rate)) * 100) / 100;
    if (clamped !== 1) rateByCharacter[c.id] = clamped;
  }
  return { narrator: n.id, dialogue, byCharacter, rateByCharacter };
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
