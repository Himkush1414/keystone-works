/**
 * The performance plan: how each queued sentence is said (pace and loudness for its emotion), how long the
 * silence after it lasts, and where the narrator takes a breath. Text only; the engine renders it.
 */
import { cueIn, cueInLine, narrationAround, NEUTRAL, type Delivery, type Emotion } from './cues';
import type { DialogueSpan } from '../cast/dialogue';
import type { CharacterStyle } from '../cast/voices';

/**
 * Pace (× the voice's own), loudness (dB) and pitch (semitones) at full intensity. The model has no emotion
 * control of its own (its `<sad>`/`<angry>` tags measurably change neither pitch nor loudness), so these
 * three are the levers: lower and slower for sadness, higher and quicker for excitement and fear. A whisper
 * can't be voiceless here; quieter, slower and a little lower is the honest approximation.
 */
export const PROSODY: Record<Emotion, { rate: number; gainDb: number; pitch: number }> = {
  neutral: { rate: 1, gainDb: 0, pitch: 0 },
  calm: { rate: 0.96, gainDb: -1, pitch: -0.4 },
  tender: { rate: 0.93, gainDb: -2.5, pitch: -0.5 },
  whisper: { rate: 0.9, gainDb: -7, pitch: -1 },
  sad: { rate: 0.9, gainDb: -2.5, pitch: -1.5 },
  fear: { rate: 1.05, gainDb: -2, pitch: 1 },
  excited: { rate: 1.07, gainDb: 1, pitch: 1.5 },
  angry: { rate: 1.05, gainDb: 2, pitch: 0.5 },
  shout: { rate: 1.04, gainDb: 3, pitch: 2 },
};

/** "he said", "she whispered": the narrator says these lighter and quicker, and a little lower. */
export const SPEAKER_TAG = { rate: 1.06, gainDb: -1.5, pitch: -0.7, maxWords: 8 } as const;

/** The last lines of a chapter slow down and settle. */
export const CHAPTER_END = { rate: 0.92, pitch: -0.5, beforeRate: 0.96 } as const;

/** Narration varies a little from line to line, as a reader's does (seeded by the text: the same line always sounds the same). */
export const VARIATION = { rate: 0.015, pitch: 0.3 } as const;

/** Extra silence, in ms, added to the pause the importer planned. */
export const BEAT = {
  question: 60,
  ellipsis: 260,
  dash: 160,
  /** Between narration and a line of dialogue in the same paragraph. */
  voiceChange: 80,
  /** Before a short sentence that ends a paragraph ("It was empty."). */
  reveal: 180,
  /** After a sad or frightened line, to let it land. */
  heavy: 120,
} as const;

/**
 * The whole silence when one speaker hands over to another: a conversation, not two paragraphs. A quick
 * reply (a few words, or the answer to a question) comes sooner, and a line cut off with a dash is
 * interrupted almost at once, its last word clipped.
 */
export const TURN = { gap: 520, quick: 300, quickWords: 4, interrupt: 40 } as const;

/** The whole silence at a scene break (`* * *`, `#`, `⁂`, `———`). */
export const SCENE_BREAK_MS = 1600;

/** The breath's own length; the pause before it shrinks by this much so the rhythm stays the same. */
export const BREATH_MS = 280;
const BREATH_MIN_GAP = 4;
const LONG_SENTENCE_CHARS = 140;

const SCENE_BREAK = /^\s*(?:(?:[*#~•·⁂✻✱]\s*){1,5}|[—–-]{3,}|[_=]{3,})\s*$/u;

export const isSceneBreak = (text: string): boolean => SCENE_BREAK.test(text);

const round = (x: number, step: number) => Math.round(x / step) * step;

/** Pace and loudness for a delivery, scaled by its intensity (half strength at intensity 0). */
export function prosodyFor(d: Delivery): { rate: number; gainDb: number; pitch: number } {
  const p = PROSODY[d.emotion];
  const k = d.emotion === 'neutral' ? 0 : 0.5 + 0.5 * Math.min(1, d.intensity);
  return {
    rate: round(1 + (p.rate - 1) * k, 0.01),
    gainDb: round(p.gainDb * k, 0.5),
    pitch: round(p.pitch * k, 0.1),
  };
}

/** A repeatable number in [-1, 1] from the text (FNV-1a). */
function jitter(text: string, salt: number): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

/** How one sentence is said: the narration around its quotation, and its own words. */
export function deliveryOf(
  blockText: string,
  sentence: { start: number; end: number; kind: string },
  quotes: readonly DialogueSpan[],
): Delivery {
  const own = cueInLine(blockText.slice(sentence.start, sentence.end));
  if (sentence.kind !== 'dialogue') {
    // The narrator stays composed: only a hint of the line's own excitement.
    return own.emotion === 'excited' ? { emotion: 'excited', intensity: own.intensity * 0.5 } : NEUTRAL;
  }
  const quote = quotes.find((q) => sentence.start >= q.start && sentence.end <= q.end);
  const tag = quote ? cueIn(narrationAround(blockText, quote, quotes)) : NEUTRAL;
  if (tag.emotion === own.emotion && tag.emotion !== 'neutral')
    return { emotion: tag.emotion, intensity: Math.min(1, Math.max(tag.intensity, own.intensity) + 0.2) };
  // The narrator's word ("she whispered") outranks punctuation unless the line itself is shouted.
  if (tag.emotion !== 'neutral' && !(own.emotion === 'shout' && own.intensity > tag.intensity)) return tag;
  return own;
}

export interface PlannedLine {
  /** Spoken text after normalisation; empty for a silent segment. */
  text: string;
  /** Raw text of the sentence, for punctuation. */
  raw: string;
  kind: string;
  speaker?: string;
  /** Pause after, as planned at import. */
  pauseMs: number;
  /** Block index, to tell paragraphs apart. */
  block: number;
  /** This sentence is the last of its block. */
  lastInBlock: boolean;
  /** This sentence ends a chapter. */
  lastInChapter?: boolean;
  /** Raw text of the whole block: scene breaks are blocks of their own. */
  blockText: string;
  delivery: Delivery;
}

export interface Performance {
  pauseMs: number;
  /** Multiplies the voice's pace; 1 = unchanged. */
  rate: number;
  gainDb: number;
  /** Semitones; 0 = the voice's own pitch. */
  pitch: number;
  breath: boolean;
  /** How the line ends: trailing off, clipped, or cut off by the next speaker. */
  ending?: 'trail' | 'clip' | 'cut';
}

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/**
 * Turns planned lines into a performance: emotion shapes pace and loudness, pauses grow at ellipses, dashes,
 * speaker changes, reveals and scene breaks, and breaths go before long sentences and emotional beats (never
 * closer than every few lines). With `expressive` off, only the importer's pauses remain.
 */
export function perform(
  lines: readonly PlannedLine[],
  opts: { expressive?: boolean; breaths?: boolean; styles?: Readonly<Record<string, CharacterStyle>> } = {},
): Performance[] {
  const expressive = opts.expressive ?? true;
  const breaths = opts.breaths ?? true;
  const out: Performance[] = lines.map((l) => ({
    pauseMs: l.pauseMs,
    rate: 1,
    gainDb: 0,
    pitch: 0,
    breath: false,
  }));
  const voiced = (i: number) => !!lines[i]?.text;
  const nextVoiced = (i: number) => {
    for (let j = i + 1; j < lines.length; j++) if (voiced(j)) return j;
    return -1;
  };
  const who = (l: PlannedLine) => (l.kind === 'dialogue' ? `d:${l.speaker ?? '?'}` : 'narrator');
  const quoteBeside = (i: number): PlannedLine | undefined => {
    const l = lines[i];
    if (!l || l.kind !== 'narration' || wordCount(l.raw) > SPEAKER_TAG.maxWords) return undefined;
    const near = [lines[i - 1], lines[i + 1]].find((x) => x?.block === l.block && x.kind === 'dialogue');
    return near;
  };
  /** Whose turn a line belongs to: a speaker tag ("she said.") is part of the quote it tags. */
  const owner = (i: number): string => {
    const l = lines[i];
    if (!l) return 'narrator';
    const q = l.kind === 'dialogue' ? l : quoteBeside(i);
    return q ? who(q) : 'narrator';
  };
  const unquoted = (raw: string) => raw.trimEnd().replace(/["”’»)\]]+$/u, '');

  let sinceBreath = BREATH_MIN_GAP;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const p = out[i];
    if (!l || !p) continue;
    if (isSceneBreak(l.blockText)) {
      p.pauseMs = Math.max(p.pauseMs, SCENE_BREAK_MS);
      continue;
    }
    if (!l.text) continue;
    sinceBreath++;
    if (expressive) {
      const { rate, gainDb, pitch } = prosodyFor(l.delivery);
      p.rate = rate;
      p.gainDb = gainDb;
      p.pitch = pitch;
      const speakerTag = quoteBeside(i) !== undefined;
      if (speakerTag) {
        p.rate = round(p.rate * SPEAKER_TAG.rate, 0.01);
        p.gainDb += SPEAKER_TAG.gainDb;
        p.pitch = round(p.pitch + SPEAKER_TAG.pitch, 0.1);
      } else if (l.kind === 'narration') {
        p.rate = round(p.rate * (1 + VARIATION.rate * jitter(l.text, 1)), 0.01);
        p.pitch = round(p.pitch + VARIATION.pitch * jitter(l.text, 2), 0.1);
      }
      const style = l.kind === 'dialogue' && l.speaker ? opts.styles?.[l.speaker] : undefined;
      if (style) {
        p.pitch = round(p.pitch + style.pitch, 0.1);
        p.gainDb += style.gainDb;
        if (p.ending !== 'cut') {
          p.pauseMs = Math.round(p.pauseMs * style.pause);
          if (style.ending) p.ending = style.ending;
        }
      }
      if (l.lastInChapter) {
        p.rate = round(p.rate * CHAPTER_END.rate, 0.01);
        p.pitch = round(p.pitch + CHAPTER_END.pitch, 0.1);
        const before = out[i - 1];
        if (before && lines[i - 1]?.text && lines[i - 1]?.block === l.block)
          before.rate = round(before.rate * CHAPTER_END.beforeRate, 0.01);
      }
      const raw = l.raw.trimEnd().replace(/["”’»)\]]+$/u, '');
      if (/(?:…|\.\.\.)$/.test(raw)) p.pauseMs += BEAT.ellipsis;
      else if (/[—–]$/.test(raw)) p.pauseMs += BEAT.dash;
      else if (/[?!]$/.test(raw)) p.pauseMs += BEAT.question;
      if (l.delivery.emotion === 'sad' || l.delivery.emotion === 'fear') p.pauseMs += BEAT.heavy;
      const j = nextVoiced(i);
      const next = lines[j];
      if (next) {
        const mine = owner(i);
        const theirs = owner(j);
        if (mine !== 'narrator' && theirs !== 'narrator' && mine !== theirs) {
          // The turn's own words: the quote itself, or the one this speaker tag belongs to.
          const said = unquoted((l.kind === 'dialogue' ? l : quoteBeside(i))?.raw ?? raw);
          const nextSaid = next.kind === 'dialogue' ? next : quoteBeside(j);
          if (l.kind === 'dialogue' && /[—–]$/.test(raw)) {
            p.pauseMs = TURN.interrupt;
            p.ending = 'cut';
          } else if (wordCount(nextSaid?.raw ?? next.raw) <= TURN.quickWords || /\?$/.test(said))
            p.pauseMs = TURN.quick;
          else p.pauseMs = TURN.gap;
        } else if (next.block === l.block && who(next) !== who(l)) p.pauseMs += BEAT.voiceChange;
        if (
          !l.lastInBlock &&
          next.block === l.block &&
          next.lastInBlock &&
          next.kind === 'narration' &&
          quoteBeside(j) === undefined &&
          wordCount(next.raw) <= 4
        )
          p.pauseMs += BEAT.reveal;
      }
    }
    // A breath needs room before it: the start of a paragraph or a change of speaker.
    const prev = i > 0 ? out[i - 1] : undefined;
    const roomy = prev !== undefined && prev.pauseMs >= 400;
    const emotional =
      ['fear', 'excited', 'angry', 'shout', 'sad'].includes(l.delivery.emotion) &&
      l.delivery.intensity >= 0.6;
    if (
      breaths &&
      roomy &&
      prev &&
      l.kind !== 'heading' &&
      l.delivery.emotion !== 'whisper' &&
      sinceBreath > BREATH_MIN_GAP &&
      (l.text.length >= LONG_SENTENCE_CHARS || (expressive && emotional))
    ) {
      p.breath = true;
      prev.pauseMs = Math.max(120, prev.pauseMs - BREATH_MS);
      sinceBreath = 0;
    }
  }
  return out;
}
