// Shared by the website's render scripts (web-samples.mts, web-demos.mts): the Supertonic engine on
// onnxruntime-node, the app's padding trim, sentence splitting, MP3 encoding and WAV reading.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Mp3Encoder } from '@breezystack/lamejs';
import * as ort from 'onnxruntime-node';
import {
  configFromJson,
  SupertonicEngine,
  unpackIndexer,
  unpackVoices,
  type OrtModule,
} from '../../../packages/engine-web/src/index.ts';

/** Longest piece the model is given (Chunks.MAX); longer sentences are split at a comma or clause. */
const MAX_PIECE = 240;
const COMMA_GAP_MS = 190;
const CLAUSE_GAP_MS = 290;
const KBPS = 56;

export async function loadEngine(dir: string) {
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

export function encodeMp3(samples: Float32Array, rate: number): Uint8Array {
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

/** A 16-bit PCM WAV file (as AudioWav.write makes them) as samples and its rate. */
export function readWav(path: string): { samples: Float32Array; rate: number } {
  const b = readFileSync(path);
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const rate = view.getUint32(24, true);
  let at = 12;
  while (at + 8 <= b.length) {
    const id = b.toString('ascii', at, at + 4);
    const size = view.getUint32(at + 4, true);
    if (id === 'data') {
      const n = size / 2;
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) samples[i] = view.getInt16(at + 8 + i * 2, true) / 32768;
      return { samples, rate };
    }
    at += 8 + size;
  }
  throw new Error(`no data chunk in ${path}`);
}

export type Engine = SupertonicEngine;
export type Voices = ReturnType<typeof unpackVoices>;
