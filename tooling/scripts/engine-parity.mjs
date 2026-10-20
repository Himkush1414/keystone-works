#!/usr/bin/env node
// Writes the parity fixture the Kotlin engine core is tested against: model-ready text, hashes, seeded noise
// and (with the model) reference audio from the TypeScript engine.
// Usage: node tooling/scripts/engine-parity.mjs <engine-dir> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ort from 'onnxruntime-node';
import {
  configFromJson,
  fnv1a,
  gaussian,
  prepareForModel,
  seedFor,
  SupertonicEngine,
  unpackIndexer,
  unpackVoices,
} from '../../packages/engine-web/src/index.ts';

const [dir, out] = process.argv.slice(2);
if (!dir || !out) {
  console.error('usage: engine-parity.mjs <engine-dir> <out.json>');
  process.exit(2);
}

const prepareCases = [
  ['The lamp was still burning.', 'en'],
  ['“Who is there?” she asked — quietly…', 'en'],
  ['Café crème, naïve résumé', 'fr'],
  ['Straße und Größe', 'de'],
  ['No final punctuation', 'en'],
  ['Hi 😀 there? [note] a/b #tag', 'en'],
  ['  spaced   out ,  text  ', 'es'],
  ['日本語の文章', 'ja'],
  ['Unknown lang code', 'xx'],
];

const fixture = {
  prepare: prepareCases.map(([text, lang]) => ({ text, lang, prepared: prepareForModel(text, lang) })),
  fnv: ['', 'lamp', 'Lamp', 'F1|8|The lamp was still burning.', 'ümlaut ✓ 😀'].map((s) => ({
    s,
    hash: fnv1a(s),
  })),
  seeds: [
    ['The lamp was still burning.', 'F1', 8],
    ['Hola', 'M3', 4],
  ].map(([t, v, s]) => ({
    text: t,
    voice: v,
    steps: s,
    seed: seedFor(t, v, s),
  })),
  noise: [7, 123456789, 4294967295].map((seed) => ({
    seed,
    values: [...gaussian(new Float32Array(9), seed)],
  })),
  synth: [],
};

const opts = { intraOpNumThreads: 2, interOpNumThreads: 1, graphOptimizationLevel: 'all' };
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
for (const [text, lang, voiceId, steps] of [
  ['The lamp was still burning.', 'en', 'F1', 4],
  ['Die Lampe brannte noch.', 'de', 'M2', 8],
]) {
  const voice = voices.find((v) => v.id === voiceId);
  const r = await engine.synthesize({ text, lang, voice, steps });
  const rms = Math.sqrt(r.samples.reduce((s, x) => s + x * x, 0) / r.samples.length);
  fixture.synth.push({
    text,
    lang,
    voice: voiceId,
    steps,
    length: r.samples.length,
    rms,
    head: [...r.samples.slice(2000, 2064)],
  });
}
writeFileSync(out, JSON.stringify(fixture, null, 1) + '\n');
console.log(
  `wrote ${out}: ${fixture.prepare.length} prepare, ${fixture.noise.length} noise, ${fixture.synth.length} synth`,
);
