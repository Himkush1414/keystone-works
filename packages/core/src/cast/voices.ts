import type { Character, Gender } from './attribute';
import type { Age, Temperament } from './profile';

export interface VoiceTraits {
  id: string;
  gender: Gender;
  /** Relative pitch, 0 (lowest) to 1 (highest). */
  pitch: number;
}

export type CastMode = 'off' | 'dialogue' | 'full';

/** How a character's lines end: trailing off (the old, the gentle) or clipped short (the fiery). */
export type Ending = 'trail' | 'clip';

/** How a character speaks, the same in every line: register, loudness, how long they leave after a line, how lines end. */
export interface CharacterStyle {
  /** Semitones from the voice's own pitch. */
  pitch: number;
  gainDb: number;
  /** × the pause after their lines. */
  pause: number;
  ending?: Ending;
}

export interface CastAssignment {
  narrator: string;
  dialogue: string;
  byCharacter: Record<string, string>;
  /** Pace for a character's voice relative to normal, when it isn't 1 (an old man unhurried, a child quick). */
  rateByCharacter?: Record<string, number>;
  /** Register, loudness, pauses and endings per character, when not plain. */
  styleByCharacter?: Record<string, CharacterStyle>;
}

/** Minimum attribution confidence before a line uses a character's own voice. */
export const NAMED_VOICE_CONFIDENCE = 0.7;

const AGE_RATE: Record<Age, number> = { old: 0.93, adult: 1, young: 1.02, child: 1.05 };
const TEMPERAMENT_RATE: Record<Temperament, number> = { calm: 0.97, gentle: 0.95, bright: 1.03, fiery: 1.04 };
/** Characters who have to share a voice are told apart by pace: slower, faster, slower… */
const SHARED_RATE = [1, 0.94, 1.06, 0.9, 1.1];

type StylePart = Partial<CharacterStyle>;
const AGE_STYLE: Record<Age, StylePart> = {
  old: { pitch: -1, pause: 1.2, ending: 'trail' },
  adult: {},
  young: { pitch: 0.5 },
  child: { pitch: 1.5, pause: 0.9 },
};
const TEMPERAMENT_STYLE: Record<Temperament, StylePart> = {
  calm: { gainDb: -0.5, pause: 1.1 },
  gentle: { pitch: -0.3, gainDb: -1.5, pause: 1.1, ending: 'trail' },
  bright: { pitch: 0.6, gainDb: 0.5, pause: 0.9 },
  fiery: { gainDb: 1.5, pause: 0.85, ending: 'clip' },
};
/** The catalog's 0–1 pitch scale (80–220 Hz, logarithmic) in semitones. */
const SEMITONES_PER_UNIT = 12 * Math.log2(220 / 80);
/** Characters of one gender are kept at least this far apart in register, as far as the offsets allow. */
const MIN_APART = 2;
/** Register offsets tried, smallest first; a character's total offset stays within ±3 semitones. */
const OFFSETS = [0, -0.5, 0.5, -1, 1, -1.5, 1.5, -2, 2, -2.5, 2.5, -3, 3];

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

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
  const styleByCharacter: Record<string, CharacterStyle> = {};
  const sharing = new Map<string, number>();
  // Where each placed character sits, in semitones, so the next one can keep clear of them.
  const placed: { gender?: Gender; at: number }[] = [];
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

    const v = byId.get(voice);
    const parts = [c.age ? AGE_STYLE[c.age] : {}, c.temperament ? TEMPERAMENT_STYLE[c.temperament] : {}];
    const own = parts.reduce((s, p) => s + (p.pitch ?? 0), 0);
    let pitch = clamp(own, -3, 3);
    if (v) {
      // The smallest nudge that keeps this character clear of everyone of their gender placed before them.
      const gender = c.gender ?? v.gender;
      const rivals = placed.filter((o) => !o.gender || o.gender === gender).map((o) => o.at);
      const base = v.pitch * SEMITONES_PER_UNIT;
      const clearance = (o: number) =>
        Math.min(Infinity, ...rivals.map((r) => Math.abs(base + clamp(own + o, -3, 3) - r)));
      const nudge =
        OFFSETS.find((o) => clearance(o) >= MIN_APART) ??
        [...OFFSETS].sort((a, b) => clearance(b) - clearance(a))[0] ??
        0;
      pitch = clamp(own + nudge, -3, 3);
      placed.push({ gender, at: base + pitch });
    }
    const style: CharacterStyle = {
      pitch: Math.round(pitch * 10) / 10,
      gainDb: clamp(
        parts.reduce((s, p) => s + (p.gainDb ?? 0), 0),
        -3,
        3,
      ),
      pause:
        Math.round(
          clamp(
            parts.reduce((s, p) => s * (p.pause ?? 1), 1),
            0.8,
            1.3,
          ) * 100,
        ) / 100,
    };
    const ending = parts[1]?.ending ?? parts[0]?.ending;
    if (ending) style.ending = ending;
    if (style.pitch !== 0 || style.gainDb !== 0 || style.pause !== 1 || style.ending)
      styleByCharacter[c.id] = style;
  }
  return { narrator: n.id, dialogue, byCharacter, rateByCharacter, styleByCharacter };
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
