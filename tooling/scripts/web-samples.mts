#!/usr/bin/env -S node --import tsx
// Renders the website's sample library: each excerpt goes through the app's own pipeline (Clean Read,
// segmentation, Cast, pauses) and the Supertonic 3 voice model at Studio+ quality, and is written as an MP3
// plus a JSON file with the text and the time each sentence is spoken (for the read-along).
//
// Usage: node --import tsx tooling/scripts/web-samples.mts <engine-dir> [sample-id ...]
//   <engine-dir>  the unpacked engine asset pack (duration_predictor.onnx … voices.bin, tts.json)
// Writes apps/web/public/samples/<id>.mp3 and apps/web/samples/<id>.json. The same input always gives the
// same audio (the model's noise is seeded from the text).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Mp3Encoder } from '@breezystack/lamejs';
import * as ort from 'onnxruntime-node';
import {
  assignVoices,
  buildQueue,
  defaultCleanSettings,
  parsePlainText,
  prepareDocument,
  recastSpeakers,
  speakerSpanOf,
  VOICE_CATALOG,
  type FixedSpeaker,
} from '../../packages/core/src/index.ts';
import {
  configFromJson,
  SupertonicEngine,
  unpackIndexer,
  unpackVoices,
  type OrtModule,
} from '../../packages/engine-web/src/index.ts';

interface SampleSpec {
  id: string;
  lang: 'en' | 'hi';
  title: string;
  part: string;
  author: string;
  year: number;
  narrator: string;
  /** Where the text comes from and how it was edited. */
  source: string;
  /**
   * Corrections a listener would make in the app: who says a line ("Who says this?", keyed by the line's
   * opening words; null for no one in particular) and a character's voice. Shown on the page, so the demo never hides a Cast miss.
   */
  fixes?: { lines?: Record<string, string | null>; voices?: Record<string, string> };
}

const SAMPLES: SampleSpec[] = [
  {
    id: 'pride-and-prejudice',
    lang: 'en',
    title: 'Pride and Prejudice',
    part: 'From Chapter 1',
    author: 'Jane Austen',
    year: 1813,
    narrator: 'F1',
    source: 'Project Gutenberg eBook #1342, the opening of Chapter 1.',
  },
  {
    id: 'alice-tea-party',
    lang: 'en',
    title: 'Alice’s Adventures in Wonderland',
    part: 'From “A Mad Tea-Party”',
    author: 'Lewis Carroll',
    year: 1865,
    narrator: 'F2',
    source: 'Project Gutenberg eBook #11, the opening of Chapter 7.',
    // “No room! No room!” they cried out: the Hatter and the March Hare together, not the sleeping Dormouse.
    fixes: { lines: { 'No room!': null } },
  },
  {
    id: 'idgah',
    lang: 'hi',
    title: 'ईदगाह',
    part: 'Idgah · आरंभ से',
    author: 'प्रेमचंद',
    year: 1933,
    narrator: 'F1',
    source: 'Wikisource, Mānsarovar 1. Abridged opening; spelling lightly modernised.',
  },
  {
    id: 'panch-parmeshwar',
    lang: 'hi',
    title: 'पंच परमेश्वर',
    part: 'Panch Parmeshwar · अंश',
    author: 'प्रेमचंद',
    year: 1916,
    narrator: 'M1',
    source:
      'Wikisource, Saptasaroj. Abridged; spelling modernised and the dialogue punctuated with quotation marks.',
    // Cast takes the stick (लाठी) for the speaker of "लाठी पटक दी और दम लेकर बोली" and has no gender for
    // अलगू, whose verbs here all take ने; both corrected as a listener would.
    fixes: { lines: { 'बेटा, तुम भी': 'खाला' }, voices: { अलगू: 'M2' } },
  },
];

/** Studio+ (the app's default quality). */
const STEPS = 16;
/** The model's own pace at 1× (PlaybackController.BASE_RATE). */
const BASE_RATE = 1.05;
/** Longest piece the model is given (Chunks.MAX); longer sentences are split at a comma or clause. */
const MAX_PIECE = 240;
const COMMA_GAP_MS = 190;
const CLAUSE_GAP_MS = 290;
const KBPS = 56;

const [engineDir, ...only] = process.argv.slice(2);
if (!engineDir) {
  console.error('usage: web-samples.mts <engine-dir> [sample-id ...]');
  process.exit(2);
}
const root = new URL('../../', import.meta.url).pathname;

async function loadEngine(dir: string) {
  const opts = { intraOpNumThreads: 4, interOpNumThreads: 1, graphOptimizationLevel: 'all' as const };
  const load = (n: string) => ort.InferenceSession.create(join(dir, `${n}.onnx`), opts);
  const [durationPredictor, textEncoder, vectorEstimator, vocoder] = await Promise.all([
    load('duration_predictor'),
    load('text_encoder'),
    load('vector_estimator'),
    load('vocoder'),
  ]);
  const engine = new SupertonicEngine(
    ort as unknown as OrtModule,
    { durationPredictor, textEncoder, vectorEstimator, vocoder },
    configFromJson(JSON.parse(readFileSync(join(dir, 'tts.json'), 'utf8'))),
    unpackIndexer(new Uint8Array(readFileSync(join(dir, 'indexer.bin')))),
  );
  const voices = unpackVoices(new Uint8Array(readFileSync(join(dir, 'voices.bin'))));
  return { engine, voices };
}

/** Splits a long sentence at the comma or clause break nearest its middle, as the app's chunker does. */
export function splitLong(text: string): { text: string; gapMs: number }[] {
  if (text.length <= MAX_PIECE) return [{ text, gapMs: 0 }];
  const breaks = [...text.matchAll(/[,;:—](?=\s)/g)].map((m) => m.index + 1);
  const mid = text.length / 2;
  const at = breaks.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
  if (!at) return [{ text, gapMs: 0 }];
  const head = text.slice(0, at).trim();
  const gapMs = /[,—]$/.test(head) ? COMMA_GAP_MS : CLAUSE_GAP_MS;
  const left = splitLong(head);
  const last = left.at(-1);
  if (last) last.gapMs = gapMs;
  return [...left, ...splitLong(text.slice(at).trim())];
}

/**
 * Cuts the model's silent padding: keeps speech from the first to the last 5 ms frame within 30 dB of the
 * loudest (walked out through sound above -50 dB), plus 30 ms before and 60 ms after, faded (Chunks.trim).
 */
export function trim(samples: Float32Array, rate: number): Float32Array {
  const n = Math.round((rate * 5) / 1000);
  const frames = Math.floor(samples.length / n);
  if (!frames) return samples;
  const energy = Array.from({ length: frames }, (_, f) => {
    let e = 0;
    for (let i = f * n; i < (f + 1) * n; i++) e += (samples[i] ?? 0) ** 2;
    return e / n;
  });
  const floor = 10 ** (-50 / 10);
  const peak = Math.max(...energy);
  const strong = Math.max(peak * 10 ** (-30 / 10), 10 ** (-40 / 10));
  const firstStrong = energy.findIndex((e) => e >= strong);
  if (firstStrong < 0) return samples;
  const lastStrong = energy.findLastIndex((e) => e >= strong);
  const walk = (from: number, step: number) => {
    let edge = from;
    let quiet = 0;
    for (let f = from + step; f >= 0 && f < frames; f += step) {
      if ((energy[f] ?? 0) > floor) {
        edge = f;
        quiet = 0;
      } else if (++quiet > 2) break;
    }
    return edge;
  };
  const first = walk(firstStrong, -1);
  const last = walk(lastStrong, 1);
  const from = Math.max(0, first * n - Math.round(rate * 0.03));
  const to = Math.min(samples.length, (last + 1) * n + Math.round(rate * 0.06));
  const out = samples.slice(from, to);
  const fadeIn = first * n - from;
  for (let i = 0; i < fadeIn; i++) out[i] = (out[i] ?? 0) * (i / fadeIn);
  const fadeOut = to - (last + 1) * n;
  for (let i = 0; i < fadeOut; i++) out[out.length - 1 - i] = (out[out.length - 1 - i] ?? 0) * (i / fadeOut);
  return out;
}

function encodeMp3(samples: Float32Array, rate: number): Uint8Array {
  const enc = new Mp3Encoder(1, rate, KBPS);
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++)
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round((samples[i] ?? 0) * 32767)));
  const parts: Uint8Array[] = [];
  for (let i = 0; i < pcm.length; i += 1152) parts.push(enc.encodeBuffer(pcm.subarray(i, i + 1152)));
  parts.push(enc.flush());
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function render(spec: SampleSpec, engine: SupertonicEngine, voices: ReturnType<typeof unpackVoices>) {
  const text = readFileSync(join(root, 'apps/web/samples', `${spec.id}.txt`), 'utf8');
  const draft = parsePlainText(text, spec.title, 'book');
  const doc = prepareDocument({ ...draft, meta: { ...draft.meta, language: spec.lang } });
  const blockText = (i: number) => {
    const s = doc.sentences[i];
    return s ? (doc.draft.blocks[s.block]?.text.slice(s.start, s.end) ?? '') : '';
  };
  const fixed: FixedSpeaker[] = Object.entries(spec.fixes?.lines ?? {}).map(([opening, speaker]) => {
    const i = doc.sentences.findIndex((_, k) => blockText(k).replace(/^[“"]/, '').startsWith(opening));
    const s = doc.sentences[i];
    const at = s && speakerSpanOf(doc.draft.blocks, s, spec.lang);
    if (!at) throw new Error(`${spec.id}: no dialogue line starts with “${opening}”`);
    return { ...at, speaker };
  });
  if (fixed.length) {
    const recast = recastSpeakers(doc.draft.blocks, doc.sentences, spec.lang, fixed);
    doc.sentences.forEach((s, i) => {
      const id = recast.speakers[i];
      if (id) s.speaker = id;
      else delete s.speaker;
    });
    doc.confidence = recast.confidence;
    doc.characters = recast.characters;
  }
  const idOf = (name: string) => doc.characters.find((c) => c.name === name)?.id ?? name;
  const overrides = Object.fromEntries(
    Object.entries(spec.fixes?.voices ?? {}).map(([name, voice]) => [idOf(name), voice]),
  );
  const assignment = assignVoices(doc.characters, spec.narrator, VOICE_CATALOG, overrides);
  const queue = buildQueue(
    { ...doc, blocks: doc.draft.blocks, chapters: doc.draft.chapters, language: doc.language },
    { clean: defaultCleanSettings('book', false), assignment, castMode: 'full', voiceProcessing: false },
  );
  const voiceOf = (id: string) => {
    const v = voices.find((x) => x.id === id);
    if (!v) throw new Error(`no voice ${id}`);
    return v;
  };

  let rate = 44100;
  const chunks: Float32Array[] = [];
  let length = 0;
  const push = (a: Float32Array) => {
    chunks.push(a);
    length += a.length;
  };
  const silence = (ms: number) => push(new Float32Array(Math.round((rate * ms) / 1000)));
  const times = new Map<number, { start: number; end: number; voice: string }>();
  const t0 = Date.now();
  for (const seg of queue) {
    const start = (length / rate) * 1000;
    if (seg.text.trim()) {
      const gain = 10 ** ((seg.gainDb ?? 0) / 20);
      for (const piece of splitLong(seg.text)) {
        const r = await engine.synthesize({
          text: piece.text,
          lang: seg.lang,
          voice: voiceOf(seg.voice),
          steps: STEPS,
          rate: BASE_RATE * (seg.rate ?? 1),
        });
        rate = r.sampleRate;
        if (r.dropped.length) console.warn(`  ${spec.id}: dropped ${r.dropped.join('')}`);
        const audio = trim(r.samples, rate);
        if (gain !== 1) for (let i = 0; i < audio.length; i++) audio[i] = (audio[i] ?? 0) * gain;
        push(audio);
        if (piece.gapMs) silence(piece.gapMs);
      }
    }
    const end = (length / rate) * 1000;
    const prev = times.get(seg.i);
    times.set(seg.i, { start: prev?.start ?? start, end, voice: seg.voice });
    silence(seg.pauseMs);
  }

  const all = new Float32Array(length);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  // One level for the whole sample: the loudest moment at -1 dBFS.
  let peak = 0;
  for (const s of all) peak = Math.max(peak, Math.abs(s));
  if (peak > 0) {
    const k = 10 ** (-1 / 20) / peak;
    for (let i = 0; i < all.length; i++) all[i] = (all[i] ?? 0) * k;
  }
  const mp3 = encodeMp3(all, rate);
  writeFileSync(join(root, 'apps/web/public/samples', `${spec.id}.mp3`), mp3);

  const names = new Map(doc.characters.map((c) => [c.id, c.name]));
  const blocks = doc.draft.blocks.map((b, bi) => ({
    kind: b.kind,
    sentences: doc.sentences
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.block === bi)
      .map(({ s, i }) => {
        const t = times.get(i);
        const speaker = s.speaker ? names.get(s.speaker) : undefined;
        return {
          text: b.text.slice(s.start, s.end),
          gap: b.text.slice(
            s.end,
            doc.sentences[i + 1]?.block === bi ? doc.sentences[i + 1]?.start : b.text.length,
          ),
          start: Math.round(t?.start ?? 0),
          end: Math.round(t?.end ?? 0),
          voice: t?.voice ?? spec.narrator,
          ...(s.kind === 'dialogue' ? { dialogue: true } : {}),
          ...(s.kind === 'dialogue' && speaker ? { speaker } : {}),
        };
      }),
  }));
  const json = {
    id: spec.id,
    lang: spec.lang,
    title: spec.title,
    part: spec.part,
    author: spec.author,
    year: spec.year,
    source: spec.source,
    ...(spec.fixes ? { corrected: true } : {}),
    narrator: spec.narrator,
    durationMs: Math.round((length / rate) * 1000),
    audio: `/samples/${spec.id}.mp3`,
    blocks,
  };
  writeFileSync(join(root, 'apps/web/samples', `${spec.id}.json`), `${JSON.stringify(json, null, 2)}\n`);
  const secs = length / rate;
  console.log(
    `${spec.id}: ${queue.length} segments, ${secs.toFixed(1)} s audio, ${(mp3.length / 1024).toFixed(0)} KB, ` +
      `${doc.characters.length} characters (${doc.characters.map((c) => `${c.name}→${assignment.byCharacter[c.id] ?? '-'}`).join(', ')}), ` +
      `rendered in ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
}

const { engine, voices } = await loadEngine(engineDir);
for (const spec of SAMPLES) if (!only.length || only.includes(spec.id)) await render(spec, engine, voices);
