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
import type { SupertonicEngine, unpackVoices } from '../../packages/engine-web/src/index.ts';
import { encodeMp3, loadEngine, splitLong, trim } from './lib/render.mts';

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
  },
];

/** Studio+ (the app's default quality). */
const STEPS = 16;
/** The model's own pace at 1× (PlaybackController.BASE_RATE). */
const BASE_RATE = 1.05;

const [engineDir, ...only] = process.argv.slice(2);
if (!engineDir) {
  console.error('usage: web-samples.mts <engine-dir> [sample-id ...]');
  process.exit(2);
}
const root = new URL('../../', import.meta.url).pathname;

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
      const pieces = splitLong(seg.text);
      for (const [k, piece] of pieces.entries()) {
        const r = await engine.synthesize({
          text: piece.text,
          lang: seg.lang,
          voice: voiceOf(seg.voice),
          steps: STEPS,
          rate: BASE_RATE * (seg.rate ?? 1),
        });
        rate = r.sampleRate;
        if (r.dropped.length) console.warn(`  ${spec.id}: dropped ${r.dropped.join('')}`);
        // As the player does: the line's last piece ends as it dies away when the queue asks for it.
        const audio = trim(r.samples, rate, !!seg.release && k === pieces.length - 1);
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
