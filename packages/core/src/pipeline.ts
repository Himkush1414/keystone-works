import { analyseCast, type Character } from './cast/attribute';
import { findDialogue } from './cast/dialogue';
import { profileCharacters } from './cast/profile';
import { voiceFor, type CastAssignment, type CastMode } from './cast/voices';
import {
  cleanReport,
  detectSkips,
  effectiveSkips,
  type CleanReport,
  type CleanSettings,
} from './clean/detect';
import type { Block, Chapter, DocumentDraft, Sentence, SentenceKind } from './model';
import { detectLanguage, VOICE_LANGUAGES, type VoiceLanguage } from './text/language';
import { normalize, type DictionaryRule } from './text/normalize';
import { segment, type Span } from './text/segment';

export const PAUSE = {
  sentence: 140,
  split: 60,
  paragraph: 450,
  heading: 700,
  chapter: 1200,
} as const;

export interface PreparedDocument {
  draft: DocumentDraft;
  language: VoiceLanguage;
  sentences: Sentence[];
  /** Attribution confidence per sentence (0 for narration). */
  confidence: number[];
  characters: Character[];
  wordCount: number;
  report: CleanReport[];
}

export interface PrepareOptions {
  fromPdf?: boolean;
  /** Language chosen by the user; skips detection. */
  language?: string;
  /** Run Cast analysis (default: books only). */
  cast?: boolean;
  maxSentenceLength?: number;
}

const asVoiceLanguage = (lang: string | undefined): VoiceLanguage | undefined => {
  const base = lang?.slice(0, 2).toLowerCase();
  return VOICE_LANGUAGES.find((l) => l === base);
};

const SPOKEN_KINDS = new Set<Block['kind']>(['heading', 'paragraph', 'quote', 'list', 'caption', 'code']);

function sampleText(blocks: readonly Block[], from: number, to: number, max = 4000): string {
  let s = '';
  for (let i = from; i < to && s.length < max; i++) {
    const b = blocks[i];
    if (b && b.kind !== 'code' && !b.skips.some((k) => k.start === 0 && k.end === b.text.length))
      s += `${b.text}\n`;
  }
  return s;
}

/** Splits a sentence span where dialogue starts or ends, so each part can have its own voice. */
function splitAtDialogue(
  text: string,
  span: Span,
  dialogue: readonly Span[],
): { span: Span; dialogueIndex: number }[] {
  const cuts = new Set<number>([span.start, span.end]);
  for (const d of dialogue) {
    if (d.start > span.start && d.start < span.end) cuts.add(d.start);
    if (d.end > span.start && d.end < span.end) cuts.add(d.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const parts: { span: Span; dialogueIndex: number }[] = [];
  for (let k = 0; k + 1 < points.length; k++) {
    let s = points[k] ?? 0;
    let e = points[k + 1] ?? 0;
    while (s < e && /\s/.test(text[s] ?? '')) s++;
    while (e > s && /\s/.test(text[e - 1] ?? '')) e--;
    if (e <= s) continue;
    const di = dialogue.findIndex((d) => s >= d.start && e <= d.end);
    if (!/[\p{L}\p{N}]/u.test(text.slice(s, e))) {
      // Punctuation-only fragment (", " or "."): glue it to the previous part.
      const prev = parts[parts.length - 1];
      if (prev) prev.span.end = e;
      continue;
    }
    parts.push({ span: { start: s, end: e }, dialogueIndex: di });
  }
  return parts;
}

/** Runs Clean Read detection, language detection, segmentation and Cast analysis. */
export function prepareDocument(input: DocumentDraft, opts: PrepareOptions = {}): PreparedDocument {
  const draft = detectSkips(input, opts.fromPdf ?? false);
  const { blocks } = draft;

  const docLang =
    asVoiceLanguage(opts.language) ??
    asVoiceLanguage(draft.meta.language) ??
    detectLanguage(sampleText(blocks, 0, blocks.length)).lang ??
    'en';

  // Per-chapter language for mixed books, only when detection is confident.
  const chapters: Chapter[] = draft.chapters.map((c, i) => {
    const end = draft.chapters[i + 1]?.blockStart ?? blocks.length;
    const d = detectLanguage(sampleText(blocks, c.blockStart, end));
    return d.lang && d.lang !== docLang && d.confidence >= 0.6 ? { ...c, language: d.lang } : { ...c };
  });
  const langOfBlock = (bi: number): VoiceLanguage => {
    let lang: VoiceLanguage = docLang;
    for (const c of chapters) {
      if (c.blockStart > bi) break;
      lang = (c.language as VoiceLanguage | undefined) ?? docLang;
    }
    return lang;
  };
  const chapterStarts = new Set(chapters.map((c) => c.blockStart));

  const useCast = opts.cast ?? draft.meta.kind === 'book';
  const castBlocks = blocks.map((b) => (b.kind === 'paragraph' || b.kind === 'quote' ? b.text : ''));
  const cast = useCast ? analyseCast(castBlocks, docLang) : { characters: [], attributions: [] };
  if (cast.characters.length) {
    const quotes = new Map<number, ReturnType<typeof findDialogue>>();
    const quotesOf = (bi: number) => {
      let q = quotes.get(bi);
      if (!q) quotes.set(bi, (q = findDialogue(castBlocks[bi] ?? '', docLang)));
      return q;
    };
    const profiles = profileCharacters(castBlocks, cast.characters, cast.attributions, quotesOf);
    cast.characters = cast.characters.map((c) => ({ ...c, ...profiles[c.id] }));
  }
  const attributionByBlock = new Map<number, typeof cast.attributions>();
  for (const a of cast.attributions) {
    const list = attributionByBlock.get(a.block) ?? [];
    list.push(a);
    attributionByBlock.set(a.block, list);
  }

  const sentences: Sentence[] = [];
  const confidence: number[] = [];
  let wordCount = 0;
  blocks.forEach((b, bi) => {
    if (!SPOKEN_KINDS.has(b.kind) || !b.text.trim()) return;
    const lang = langOfBlock(bi);
    const spans = segment(b.text, lang, opts.maxSentenceLength ?? 280);
    const attrs = attributionByBlock.get(bi) ?? [];
    const dialogue =
      useCast && (b.kind === 'paragraph' || b.kind === 'quote') ? findDialogue(b.text, lang) : [];
    wordCount += b.text.split(/\s+/).filter(Boolean).length;
    spans.forEach((span, si) => {
      const parts = dialogue.length ? splitAtDialogue(b.text, span, dialogue) : [{ span, dialogueIndex: -1 }];
      parts.forEach((p, pi) => {
        const d = p.dialogueIndex >= 0 ? dialogue[p.dialogueIndex] : undefined;
        const attr = d ? attrs.find((a) => a.span.start === d.start && a.span.end === d.end) : undefined;
        const kind: SentenceKind = b.kind === 'heading' ? 'heading' : d ? 'dialogue' : 'narration';
        const lastInBlock = si === spans.length - 1 && pi === parts.length - 1;
        const lastInChapter = lastInBlock && chapterStarts.has(bi + 1);
        const pauseMs = lastInChapter
          ? PAUSE.chapter
          : lastInBlock
            ? b.kind === 'heading'
              ? PAUSE.heading
              : PAUSE.paragraph
            : pi < parts.length - 1
              ? PAUSE.split
              : PAUSE.sentence;
        sentences.push({
          block: bi,
          start: p.span.start,
          end: p.span.end,
          kind,
          pauseMs,
          ...(attr?.speaker ? { speaker: attr.speaker } : {}),
        });
        confidence.push(attr?.confidence ?? 0);
      });
    });
  });

  return {
    draft: { ...draft, chapters },
    language: docLang,
    sentences,
    confidence,
    characters: cast.characters,
    wordCount,
    report: cleanReport(draft),
  };
}

export interface QueueSegment {
  /** Sentence index in the document. */
  i: number;
  /** What the voice says; empty when everything in the sentence is skipped. */
  text: string;
  lang: string;
  voice: string;
  pauseMs: number;
  kind: SentenceKind;
  /** Pace relative to the listener's speed, when not 1 (a character's own pace). */
  rate?: number;
}

export interface QueueOptions {
  clean: CleanSettings;
  customSkips?: readonly string[];
  dictionary?: readonly DictionaryRule[];
  assignment: CastAssignment;
  castMode: CastMode;
  from?: number;
  to?: number;
}

export interface QueueSource {
  blocks: readonly Block[];
  chapters: readonly Chapter[];
  sentences: readonly Sentence[];
  confidence?: readonly number[];
  language: string;
}

/** Builds the spoken queue the native engine plays, from sentence `from` (inclusive) to `to` (exclusive). */
export function buildQueue(doc: QueueSource, opts: QueueOptions): QueueSegment[] {
  const skipsByBlock = new Map<number, ReturnType<typeof effectiveSkips>>();
  const chapterLang = (bi: number) => {
    let lang = doc.language;
    for (const c of doc.chapters) {
      if (c.blockStart > bi) break;
      lang = c.language ?? doc.language;
    }
    return lang;
  };
  const from = Math.max(0, opts.from ?? 0);
  const to = Math.min(doc.sentences.length, opts.to ?? doc.sentences.length);
  const out: QueueSegment[] = [];
  for (let i = from; i < to; i++) {
    const s = doc.sentences[i];
    const block = s ? doc.blocks[s.block] : undefined;
    if (!s || !block) continue;
    let skips = skipsByBlock.get(s.block);
    if (!skips) {
      skips = effectiveSkips(block, opts.clean, opts.customSkips ?? []);
      skipsByBlock.set(s.block, skips);
    }
    const lang = chapterLang(s.block);
    const spoken = normalize(block.text, s, lang, {
      skips,
      dictionary: opts.dictionary ?? [],
      speakUrls: !opts.clean.url,
    });
    const text = /[\p{L}\p{N}]/u.test(spoken.text) ? spoken.text : '';
    const confidence = doc.confidence?.[i] ?? 1;
    const voice = voiceFor(opts.assignment, opts.castMode, s.kind, s.speaker, confidence);
    const ownVoice = s.speaker !== undefined && voice === opts.assignment.byCharacter[s.speaker];
    const rate = ownVoice && s.speaker ? opts.assignment.rateByCharacter?.[s.speaker] : undefined;
    out.push({ i, text, lang, voice, pauseMs: s.pauseMs, kind: s.kind, ...(rate ? { rate } : {}) });
  }
  return out;
}
