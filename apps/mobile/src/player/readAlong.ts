import {
  effectiveSkips,
  estimateWordTimes,
  normalize,
  type Block,
  type CleanSettings,
  type DictionaryRule,
  type Sentence,
  type WordTime,
} from '@lamplight/core';
import type { ReaderTheme } from '@lamplight/tokens';
import { mixColor } from '../theme/color';

/** A stretch of a block's text with one look: which sentence it belongs to, and whether narration skips it. */
export interface Run {
  start: number;
  end: number;
  /** Sentence index, or null for the space between sentences. */
  sentence: number | null;
  skipped: boolean;
  /** Italic in the source. */
  emphasis: boolean;
}

export interface ReadBlock {
  /** Block index in the document. */
  index: number;
  kind: Block['kind'];
  level?: number;
  text: string;
  runs: Run[];
  /** First sentence in this block, or -1 when nothing in it is spoken. */
  firstSentence: number;
}

/**
 * The document as the read-along view draws it: every block cut into runs at sentence and skip boundaries,
 * so the current sentence can glow and skipped text can be dimmed or hidden without re-measuring anything.
 */
export function readAlongBlocks(
  blocks: readonly Block[],
  sentences: readonly Sentence[],
  clean: CleanSettings,
  customSkips: readonly string[] = [],
): ReadBlock[] {
  const byBlock = new Map<number, { s: Sentence; i: number }[]>();
  sentences.forEach((s, i) => {
    const list = byBlock.get(s.block) ?? [];
    list.push({ s, i });
    byBlock.set(s.block, list);
  });
  return blocks.map((block, index) => {
    const spoken = byBlock.get(index) ?? [];
    const skips = effectiveSkips(block, clean, customSkips);
    const cuts = new Set<number>([0, block.text.length]);
    for (const { s } of spoken) cuts.add(s.start).add(s.end);
    for (const k of skips) cuts.add(k.start).add(k.end);
    const emphasis = block.emphasis ?? [];
    for (const [a, b] of emphasis) cuts.add(a).add(b);
    const points = [...cuts].filter((p) => p >= 0 && p <= block.text.length).sort((a, b) => a - b);
    const runs: Run[] = [];
    for (let k = 0; k + 1 < points.length; k++) {
      const start = points[k] ?? 0;
      const end = points[k + 1] ?? 0;
      if (end <= start) continue;
      const owner = spoken.find(({ s }) => start >= s.start && end <= s.end);
      const skipped = skips.some((x) => start >= x.start && end <= x.end);
      const emphasised = emphasis.some(([a, b]) => start >= a && end <= b);
      const run = { start, end, sentence: owner?.i ?? null, skipped, emphasis: emphasised };
      const prev = runs[runs.length - 1];
      if (
        prev &&
        prev.sentence === run.sentence &&
        prev.skipped === run.skipped &&
        prev.emphasis === run.emphasis &&
        prev.end === start
      )
        prev.end = end;
      else runs.push(run);
    }
    return {
      index,
      kind: block.kind,
      ...(block.level !== undefined ? { level: block.level } : {}),
      text: block.text,
      runs,
      firstSentence: spoken[0]?.i ?? -1,
    };
  });
}

/** Index in `readBlocks` of the block holding sentence `index` (for scrolling to the voice). */
export function blockOfSentence(sentences: readonly Sentence[], index: number): number {
  return sentences[Math.max(0, Math.min(index, sentences.length - 1))]?.block ?? 0;
}

/**
 * When each word of a sentence is heard, given how long it lasts. Uses the same normalisation as the queue,
 * so "1984" is timed as "nineteen eighty-four" while the underline stays on the digits.
 */
export function wordTimesFor(
  block: Block,
  sentence: Sentence,
  lang: string,
  durationMs: number,
  opts: { clean: CleanSettings; customSkips?: readonly string[]; dictionary?: readonly DictionaryRule[] },
): WordTime[] {
  const spoken = normalize(block.text, sentence, lang, {
    skips: effectiveSkips(block, opts.clean, opts.customSkips ?? []),
    dictionary: opts.dictionary ?? [],
    speakUrls: !opts.clean.url, // exactly as buildQueue decides it
  });
  return estimateWordTimes(spoken, block.text, durationMs);
}

/** A small coloured name before a line of dialogue: who the app thinks says it. */
export interface SpeakerLabel {
  /** The character's id, or null when Cast couldn't tell. */
  id: string | null;
  name: string;
  color: string;
}

/** Colours for speaker names: at least 4.6:1 on every light reader paper (sepia included) and 6:1 on the dark ones. */
const LABEL_COLORS = {
  light: ['#9D432E', '#2D6592', '#456B28', '#764BB0', '#7A5B0F', '#1B6B62', '#A13B67', '#4757A3'],
  dark: ['#F08A6E', '#7DB8E8', '#9BCB72', '#BE9BF2', '#E2C060', '#6CCFC2', '#EF8DB5', '#9DA8EE'],
} as const;
const UNKNOWN_COLOR = { light: '#606060', dark: '#A8A8A8' } as const;

/**
 * The label for the first sentence of each turn of dialogue (a turn: consecutive dialogue sentences of one
 * speaker in one paragraph). Colours go to characters in order of their first line in the book, so a
 * character keeps the same colour when a correction changes who has the most lines.
 */
export function speakerLabels(
  sentences: readonly Pick<Sentence, 'block' | 'kind'>[],
  speakers: readonly (string | undefined)[],
  names: ReadonlyMap<string, string>,
  unknown: string,
  dark: boolean,
): Map<number, SpeakerLabel> {
  const palette = LABEL_COLORS[dark ? 'dark' : 'light'];
  const order = new Map<string, number>();
  const out = new Map<number, SpeakerLabel>();
  let prev: { block: number; speaker: string | undefined } | null = null;
  sentences.forEach((s, i) => {
    if (s.kind !== 'dialogue') {
      prev = null;
      return;
    }
    const speaker = speakers[i];
    if (speaker && !order.has(speaker)) order.set(speaker, order.size);
    if (!prev || prev.block !== s.block || prev.speaker !== speaker) {
      out.set(
        i,
        speaker
          ? {
              id: speaker,
              name: names.get(speaker) ?? speaker,
              color: palette[(order.get(speaker) ?? 0) % palette.length] ?? palette[0],
            }
          : { id: null, name: unknown, color: UNKNOWN_COLOR[dark ? 'dark' : 'light'] },
      );
    }
    prev = { block: s.block, speaker };
  });
  return out;
}

/** How far line focus moves the other sentences' ink toward the page: every theme stays at 3:1 or more. */
const FOCUS_FADE = 0.4;

/** The ink for text outside the current sentence when line focus is on. */
export function focusInk(theme: Pick<ReaderTheme, 'ink' | 'bg'>): string {
  return mixColor(theme.ink, theme.bg, FOCUS_FADE);
}
