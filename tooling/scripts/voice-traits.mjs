#!/usr/bin/env node
// Measures each built-in voice from real engine output: median pitch (Hz) and speaking pace (characters per
// second at the default rate). The numbers feed packages/core/src/cast/catalog.ts.
// Usage: node --import tsx tooling/scripts/voice-traits.mjs <engine-dir>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ort from 'onnxruntime-node';
import {
  configFromJson,
  medianPitch,
  SupertonicEngine,
  unpackIndexer,
  unpackVoices,
} from '../../packages/engine-web/src/index.ts';

const [dir] = process.argv.slice(2);
if (!dir) {
  console.error('usage: voice-traits.mjs <engine-dir>');
  process.exit(2);
}

const SENTENCES = [
  'The lamp was still burning when she opened the book again.',
  'Every evening, the harbour filled with small boats and quiet voices.',
  'He paused at the door, listening, then stepped out into the rain.',
];

const opts = { intraOpNumThreads: 4 };
const load = (n) => ort.InferenceSession.create(join(dir, `${n}.onnx`), opts);
const [durationPredictor, textEncoder, vectorEstimator, vocoder] = await Promise.all(
  ['duration_predictor', 'text_encoder', 'vector_estimator', 'vocoder'].map(load),
);
const engine = new SupertonicEngine(
  ort,
  { durationPredictor, textEncoder, vectorEstimator, vocoder },
  configFromJson(JSON.parse(readFileSync(join(dir, 'tts.json'), 'utf8'))),
  unpackIndexer(new Uint8Array(readFileSync(join(dir, 'indexer.bin')))),
);
const voices = unpackVoices(new Uint8Array(readFileSync(join(dir, 'voices.bin'))));

const out = [];
for (const voice of voices) {
  const pitches = [];
  let chars = 0;
  let ms = 0;
  for (const text of SENTENCES) {
    const r = await engine.synthesize({ text, lang: 'en', voice, steps: 8 });
    pitches.push(medianPitch(r.samples, r.sampleRate));
    chars += text.length;
    ms += r.durationMs;
  }
  pitches.sort((a, b) => a - b);
  out.push({
    id: voice.id,
    pitchHz: Math.round(pitches[1] ?? 0),
    charsPerSecond: Math.round((chars / (ms / 1000)) * 10) / 10,
  });
  console.error(`${voice.id}: ${JSON.stringify(out.at(-1))}`);
}
console.log(JSON.stringify(out, null, 2));
