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

/** A stretch of a block's text with one look: which sentence it belongs to, and whether narration skips it. */
export interface Run {
  start: number;
  end: number;
  /** Sentence index, or null for the space between sentences. */
  sentence: number | null;
  skipped: boolean;
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
    const points = [...cuts].filter((p) => p >= 0 && p <= block.text.length).sort((a, b) => a - b);
    const runs: Run[] = [];
    for (let k = 0; k + 1 < points.length; k++) {
      const start = points[k] ?? 0;
      const end = points[k + 1] ?? 0;
      if (end <= start) continue;
      const owner = spoken.find(({ s }) => start >= s.start && end <= s.end);
      const skipped = skips.some((x) => start >= x.start && end <= x.end);
      const run = { start, end, sentence: owner?.i ?? null, skipped };
      const prev = runs[runs.length - 1];
      if (prev && prev.sentence === run.sentence && prev.skipped === run.skipped && prev.end === start)
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
