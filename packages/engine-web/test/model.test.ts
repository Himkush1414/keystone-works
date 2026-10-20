/**
 * Integration test with the real voice model. Runs when LAMPLIGHT_ENGINE_DIR points at an extracted engine
 * asset pack (see tooling/scripts/engine-assets.mjs); skipped otherwise.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  configFromJson,
  medianPitch,
  SupertonicEngine,
  unpackIndexer,
  unpackVoices,
  type OrtModule,
  type VoiceStyle,
} from '../src';

const dir = process.env.LAMPLIGHT_ENGINE_DIR ?? '';
const enabled = !!dir && existsSync(join(dir, 'manifest.json'));

describe.skipIf(!enabled)('Supertonic 3 with the real model', () => {
  let engine: SupertonicEngine;
  let voices: VoiceStyle[] = [];
  const voice = (id: string) => {
    const v = voices.find((x) => x.id === id);
    if (!v) throw new Error(`missing voice ${id}`);
    return v;
  };

  beforeAll(async () => {
    const ort = await import('onnxruntime-node');
    const opts = { intraOpNumThreads: 2, interOpNumThreads: 1, graphOptimizationLevel: 'all' as const };
    const load = (n: string) => ort.InferenceSession.create(join(dir, `${n}.onnx`), opts);
    const [durationPredictor, textEncoder, vectorEstimator, vocoder] = await Promise.all([
      load('duration_predictor'),
      load('text_encoder'),
      load('vector_estimator'),
      load('vocoder'),
    ]);
    engine = new SupertonicEngine(
      ort as unknown as OrtModule,
      { durationPredictor, textEncoder, vectorEstimator, vocoder },
      configFromJson(JSON.parse(readFileSync(join(dir, 'tts.json'), 'utf8'))),
      unpackIndexer(new Uint8Array(readFileSync(join(dir, 'indexer.bin')))),
    );
    voices = unpackVoices(new Uint8Array(readFileSync(join(dir, 'voices.bin'))));
  }, 120_000);

  it('has ten voices', () => {
    expect(voices.map((v) => v.id)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'M1', 'M2', 'M3', 'M4', 'M5']);
  });

  it('speaks a sentence with a plausible length and level', async () => {
    const r = await engine.synthesize({
      text: 'The lamp was still burning.',
      lang: 'en',
      voice: voice('F1'),
      steps: 4,
    });
    expect(r.sampleRate).toBe(44100);
    expect(r.durationMs).toBeGreaterThan(900);
    expect(r.durationMs).toBeLessThan(4000);
    const rms = Math.sqrt(r.samples.reduce((s, x) => s + x * x, 0) / r.samples.length);
    expect(rms).toBeGreaterThan(0.01);
    expect(r.dropped).toEqual([]);
  });

  it('is deterministic for the same text, voice and steps', async () => {
    const req = { text: 'Same seed, same sound.', lang: 'en', voice: voice('M1'), steps: 4 };
    const a = await engine.synthesize(req);
    const b = await engine.synthesize(req);
    expect(a.samples.length).toBe(b.samples.length);
    let diff = 0;
    for (let i = 0; i < a.samples.length; i++) {
      diff = Math.max(diff, Math.abs((a.samples[i] ?? 0) - (b.samples[i] ?? 0)));
    }
    expect(diff).toBe(0);
  });

  it('gives female and male presets clearly different pitch', async () => {
    const text = 'Every book deserves a voice, and tonight the story is yours.';
    const f = await engine.synthesize({ text, lang: 'en', voice: voice('F2'), steps: 4 });
    const m = await engine.synthesize({ text, lang: 'en', voice: voice('M2'), steps: 4 });
    expect(medianPitch(f.samples, f.sampleRate)).toBeGreaterThan(medianPitch(m.samples, m.sampleRate) * 1.3);
  });

  it('speaks other languages', async () => {
    const r = await engine.synthesize({
      text: 'Die Lampe brannte noch.',
      lang: 'de',
      voice: voice('F3'),
      steps: 4,
    });
    expect(r.durationMs).toBeGreaterThan(700);
  });
});
