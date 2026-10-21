import type { Spoken } from './normalize';

/** A word's display range in the block text and its estimated time within the sentence audio. */
export interface WordTime {
  start: number;
  end: number;
  t0: number;
  t1: number;
}

const LATIN_VOWELS = /[aeiouyàáâãäåæèéêëìíîïòóôõöøœùúûüýÿ]+/giu;
const CJK = /[぀-ヿ㐀-鿿가-힯]/u;

/** Rough syllable count; good enough to share out time between words. */
export function syllables(word: string): number {
  const letters = word.replace(/[^\p{L}\p{N}]/gu, '');
  if (!letters) return 0;
  if (CJK.test(letters)) return [...letters].length;
  // A diaeresis marks a vowel that starts its own syllable ("naïve", "Zoë").
  const groups =
    (letters.match(LATIN_VOWELS)?.length ?? 0) + (letters.match(/(?<=[aeiouy])[äëïöü]/giu)?.length ?? 0);
  if (groups) return letters.length > 3 && /e$/i.test(letters) && groups > 1 ? groups - 1 : groups;
  if (/^\d+$/.test(letters)) return letters.length * 1.5;
  return Math.max(1, Math.ceil([...letters].length / 3));
}

/** Extra weight (in syllables) for the pause the voice makes after trailing punctuation. */
function pauseWeight(word: string): number {
  if (/[.!?…。！？]["'”’»)\]]*$/u.test(word)) return 2.2;
  if (/[;:]["'”’»)\]]*$/u.test(word)) return 1.6;
  if (/[,،、]["'”’»)\]]*$/u.test(word)) return 1.2;
  if (/[—–]$/u.test(word)) return 1.4;
  return 0;
}

const LEAD_MS = 60;
const TAIL_MS = 140;

/**
 * Estimates when each displayed word is spoken in a sentence lasting `durationMs`.
 * Words come from identity pieces (exact display ranges) and replaced pieces (a spoken expansion such as
 * "nineteen eighty-four" maps to the whole display range "1984").
 *
 * shortcut: estimated word timing from syllable weights; upgrade when the model exposes per-token durations.
 */
export function estimateWordTimes(spoken: Spoken, blockText: string, durationMs: number): WordTime[] {
  const words: { start: number; end: number; weight: number }[] = [];
  for (const p of spoken.pieces) {
    if (!p.spoken.trim()) continue;
    if (p.replaced) {
      const weight = p.spoken.split(/\s+/).reduce((sum, w) => sum + syllables(w), 0) + pauseWeight(p.spoken);
      words.push({ start: p.start, end: p.end, weight: Math.max(weight, 0.5) });
      continue;
    }
    const slice = blockText.slice(p.start, p.end);
    for (const m of slice.matchAll(/\S+/gu)) {
      const w = m[0];
      if (syllables(w) === 0) {
        // Stray punctuation ("." after "1984", a lone dash) has no time of its own; its pause belongs to the
        // word before it, so the underline never lands on the punctuation.
        const prev = words[words.length - 1];
        if (prev) prev.weight += pauseWeight(w);
        continue;
      }
      words.push({
        start: p.start + m.index,
        end: p.start + m.index + w.length,
        weight: syllables(w) + pauseWeight(w),
      });
    }
  }
  if (!words.length) return [];

  const lead = Math.min(LEAD_MS, durationMs * 0.05);
  const tail = Math.min(TAIL_MS, durationMs * 0.08);
  const span = Math.max(0, durationMs - lead - tail);
  const total = words.reduce((s, w) => s + w.weight, 0);
  let t = lead;
  return words.map((w) => {
    const dt = (w.weight / total) * span;
    const out = { start: w.start, end: w.end, t0: Math.round(t), t1: Math.round(t + dt) };
    t += dt;
    return out;
  });
}

/** Index of the word being spoken at `ms`, or -1 before the first word. Binary search. */
export function wordAt(times: readonly WordTime[], ms: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((times[mid]?.t0 ?? 0) <= ms) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
