#!/usr/bin/env node
// Builds the engine asset pack that ships inside the app: Supertonic 3 int8 graphs, packed voices and indexer,
// config, licences and a SHA-256 manifest.
//
// Usage: node tooling/scripts/engine-assets.mjs <int8-model-dir> <hf-dir> <out-dir>
//   <int8-model-dir>  extracted sherpa-onnx-supertonic-3-tts-int8-2026-05-11 (from k2-fsa/sherpa-onnx releases)
//   <hf-dir>          tts.json, unicode_indexer.json, F1..F5/M1..M5.json and LICENSE from Supertone/supertonic-3
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { packIndexer, packVoices, voiceFromJson } from '../../packages/engine-web/src/assets.ts';

const [modelDir, hfDir, outDir] = process.argv.slice(2);
if (!modelDir || !hfDir || !outDir) {
  console.error('usage: engine-assets.mjs <int8-model-dir> <hf-dir> <out-dir>');
  process.exit(2);
}

const VERSION = 'supertonic3-int8-v1';
const VOICES = ['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5'];
const GRAPHS = ['duration_predictor', 'text_encoder', 'vector_estimator', 'vocoder'];

const files = {};
for (const g of GRAPHS) files[`${g}.onnx`] = readFileSync(join(modelDir, `${g}.int8.onnx`));
files['tts.json'] = readFileSync(join(hfDir, 'tts.json'));
files['indexer.bin'] = packIndexer(JSON.parse(readFileSync(join(hfDir, 'unicode_indexer.json'), 'utf8')));
files['voices.bin'] = packVoices(
  VOICES.map((id) => voiceFromJson(id, JSON.parse(readFileSync(join(hfDir, `${id}.json`), 'utf8')))),
);
files['LICENSE-MODEL.txt'] = readFileSync(join(hfDir, 'LICENSE'));
files['NOTICE.txt'] = Buffer.from(
  [
    'Supertonic 3 voice model, Copyright (c) 2026 Supertone Inc.',
    'Licensed under the BigScience Open RAIL-M License (LICENSE-MODEL.txt), including its use-based',
    'restrictions in Attachment A, which apply to every user of this model.',
    '',
    'Modifications: the ONNX graphs are int8-quantised derivatives prepared by the sherpa-onnx project',
    '(k2-fsa/sherpa-onnx, release tts-models, sherpa-onnx-supertonic-3-tts-int8-2026-05-11). Voice styles and the',
    'unicode indexer are repacked into a compact binary format by Lamplight without changing their values.',
    '',
  ].join('\n'),
);

const sha = (b) => createHash('sha256').update(b).digest('hex');
const manifest = {
  version: VERSION,
  sampleRate: JSON.parse(files['tts.json'].toString()).ae.sample_rate,
  voices: VOICES,
  files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, { bytes: v.length, sha256: sha(v) }])),
};
files['manifest.json'] = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');

mkdirSync(outDir, { recursive: true });
const zip = zipSync(
  Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [new Uint8Array(v), { level: 0 }]])),
);
const name = `lamplight-engine-${VERSION}.zip`;
writeFileSync(join(outDir, name), zip);
writeFileSync(join(outDir, `${name}.sha256`), `${sha(zip)}  ${name}\n`);
console.log(`${name}  ${(zip.length / 1e6).toFixed(1)} MB  sha256 ${sha(zip)}`);
for (const [k, v] of Object.entries(manifest.files))
  console.log(`  ${k.padEnd(26)} ${(v.bytes / 1e6).toFixed(2)} MB`);
