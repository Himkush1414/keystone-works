import type { Sample, SampleSentence } from './samples';

export interface TimedSentence extends SampleSentence {
  /** Index in reading order across the whole sample. */
  index: number;
  block: number;
}

/** Every sentence in reading order. */
export function flatten(sample: Pick<Sample, 'blocks'>): TimedSentence[] {
  const out: TimedSentence[] = [];
  sample.blocks.forEach((b, block) =>
    b.sentences.forEach((s) => out.push({ ...s, index: out.length, block })),
  );
  return out;
}

/**
 * The sentence to light up at `ms`: the one being spoken, or during a pause the one just finished (so the
 * highlight doesn't flicker off between sentences). -1 before the first sentence starts.
 */
export function sentenceAt(sentences: readonly Pick<SampleSentence, 'start'>[], ms: number): number {
  let lo = 0;
  let hi = sentences.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((sentences[mid]?.start ?? Infinity) <= ms) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Colours for speaker names, the app's own (readAlong.ts): 4.6:1 on the light papers, 6:1 on the dark. */
export const LABEL_COLORS = {
  light: ['#9D432E', '#2D6592', '#456B28', '#764BB0', '#7A5B0F', '#1B6B62', '#A13B67', '#4757A3'],
  dark: ['#F08A6E', '#7DB8E8', '#9BCB72', '#BE9BF2', '#E2C060', '#6CCFC2', '#EF8DB5', '#9DA8EE'],
} as const;

export interface SpeakerLabel {
  name: string | null;
  /** Position in the label palette; -1 for a line Cast couldn't attribute. */
  slot: number;
}

/**
 * A label before the first sentence of each turn of dialogue (consecutive dialogue sentences of one speaker
 * in one paragraph), as the app shows them. Characters take colours in order of their first line.
 */
export function speakerLabels(sentences: readonly TimedSentence[]): Map<number, SpeakerLabel> {
  const order = new Map<string, number>();
  const out = new Map<number, SpeakerLabel>();
  let prev: { block: number; speaker: string | undefined } | null = null;
  for (const s of sentences) {
    if (!s.dialogue) {
      prev = null;
      continue;
    }
    if (s.speaker && !order.has(s.speaker)) order.set(s.speaker, order.size);
    if (!prev || prev.block !== s.block || prev.speaker !== s.speaker)
      out.set(s.index, {
        name: s.speaker ?? null,
        slot: s.speaker ? (order.get(s.speaker) ?? 0) % LABEL_COLORS.light.length : -1,
      });
    prev = { block: s.block, speaker: s.speaker };
  }
  return out;
}
