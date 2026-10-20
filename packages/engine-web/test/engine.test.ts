import { describe, expect, it } from 'vitest';
import {
  encodeWav,
  fnv1a,
  gaussian,
  medianPitch,
  mulberry32,
  packIndexer,
  packVoices,
  prepareForModel,
  seedFor,
  SupertonicEngine,
  unpackIndexer,
  unpackVoices,
  voiceFromJson,
  type OrtModule,
  type OrtTensor,
  type Sessions,
} from '../src';

describe('prepareForModel', () => {
  it('simplifies punctuation, adds a final stop and wraps in language tags', () => {
    expect(prepareForModel('“Hello” — she said', 'en')).toBe('<en>"Hello" - she said.</en>');
    expect(prepareForModel('Fin !', 'fr')).toBe('<fr>Fin!</fr>');
    expect(prepareForModel('Hi 😀 there?', 'xx')).toBe('<en>Hi there?</en>');
  });
});

describe('asset formats', () => {
  it('round-trips the indexer', () => {
    const idx = [-1, -1, 0, 5, -1, 32000];
    expect([...unpackIndexer(packIndexer(idx))]).toEqual(idx);
  });

  it('round-trips voices and validates sizes', () => {
    const json = {
      style_ttl: {
        dims: [1, 2, 3],
        data: [
          [
            [1, 2, 3],
            [4, 5, 6],
          ],
        ],
      },
      style_dp: { dims: [1, 1, 2], data: [[[0.5, -0.5]]] },
    };
    const v = voiceFromJson('F1', json);
    const [back] = unpackVoices(packVoices([v, { ...v, id: 'M1' }]));
    expect(back?.id).toBe('F1');
    expect([...(back?.ttl.data ?? [])]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(back?.dp.dims).toEqual([1, 1, 2]);
    expect(() => voiceFromJson('X', { ...json, style_dp: { dims: [1, 1, 3], data: [1] } })).toThrow(/size/);
    expect(() => unpackVoices(new Uint8Array([1, 2, 3, 4, 0, 0, 0, 0]))).toThrow(/header/);
  });
});

describe('seeded noise', () => {
  it('is deterministic and standard normal', () => {
    expect(fnv1a('lamp')).toBe(fnv1a('lamp'));
    expect(fnv1a('lamp')).not.toBe(fnv1a('Lamp'));
    const r = mulberry32(42);
    expect(r()).toBe(mulberry32(42)());
    const a = gaussian(new Float32Array(100_000), 7);
    expect([...a.slice(0, 5)]).toEqual([...gaussian(new Float32Array(5), 7)]);
    const mean = a.reduce((s, x) => s + x, 0) / a.length;
    const sd = Math.sqrt(a.reduce((s, x) => s + (x - mean) ** 2, 0) / a.length);
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(Math.abs(sd - 1)).toBeLessThan(0.02);
  });

  it('seeds by text, voice and steps', () => {
    expect(seedFor('a', 'F1', 8)).toBe(seedFor('a', 'F1', 8));
    expect(seedFor('a', 'F1', 8)).not.toBe(seedFor('a', 'F1', 4));
    expect(seedFor('a', 'F1', 8)).not.toBe(seedFor('a', 'F2', 8));
  });
});

describe('audio helpers', () => {
  it('writes a valid WAV header', () => {
    const w = encodeWav(new Float32Array([0, 1, -1, 2]), 44100);
    const v = new DataView(w.buffer);
    expect(String.fromCharCode(...w.slice(0, 4))).toBe('RIFF');
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(48, true)).toBe(-32767);
    expect(v.getInt16(50, true)).toBe(32767); // clipped
  });

  it('measures the pitch of a tone', () => {
    const sr = 22050;
    const tone = Float32Array.from({ length: sr }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 180 * i) / sr));
    expect(medianPitch(tone, sr)).toBeGreaterThan(175);
    expect(medianPitch(tone, sr)).toBeLessThan(185);
    expect(medianPitch(new Float32Array(sr), sr)).toBe(0);
  });
});

describe('SupertonicEngine (with a stub runtime)', () => {
  class Tensor implements OrtTensor {
    constructor(
      readonly type: string,
      readonly data: Float32Array | BigInt64Array,
      readonly dims: readonly number[],
    ) {}
  }
  const ort = { Tensor } as unknown as OrtModule;
  const calls: string[] = [];
  const sessions: Sessions = {
    durationPredictor: {
      run: async () => {
        calls.push('dp');
        return { duration: new Tensor('float32', Float32Array.of(1.05), [1]) };
      },
    },
    textEncoder: {
      run: async (f) => {
        calls.push('te');
        return {
          text_emb: new Tensor('float32', new Float32Array(4), [1, 4, (f.text_ids?.dims[1] as number) ?? 1]),
        };
      },
    },
    vectorEstimator: {
      run: async (f) => {
        calls.push(`ve${(f.current_step?.data as Float32Array)[0]}`);
        const d = f.noisy_latent?.data as Float32Array;
        return {
          denoised_latent: new Tensor(
            'float32',
            d.map((x) => x * 0.5),
            f.noisy_latent?.dims ?? [],
          ),
        };
      },
    },
    vocoder: {
      run: async (f) => {
        calls.push('voc');
        const [, , T = 1] = f.latent?.dims ?? [];
        return { wav_tts: new Tensor('float32', new Float32Array(T * 6 * 512).fill(0.1), [1, T * 6 * 512]) };
      },
    },
  };
  const indexer = new Int16Array(0x3000).fill(-1);
  for (const ch of '<>/enHloi.') indexer[ch.charCodeAt(0)] = ch.charCodeAt(0) % 100;
  const engine = new SupertonicEngine(
    ort,
    sessions,
    { sampleRate: 44100, baseChunkSize: 512, chunkCompressFactor: 6, latentDim: 24 },
    indexer,
  );
  const voice = voiceFromJson('F1', {
    style_ttl: { dims: [1, 1, 2], data: [1, 2] },
    style_dp: { dims: [1, 1, 1], data: [3] },
  });

  it('runs the four graphs in order and trims audio to the predicted duration', async () => {
    const r = await engine.synthesize({ text: 'Hello', lang: 'en', voice, steps: 3 });
    expect(calls).toEqual(['dp', 'te', 've0', 've1', 've2', 'voc']);
    expect(r.sampleRate).toBe(44100);
    expect(r.samples.length).toBe(44100);
    expect(Math.round(r.durationMs)).toBe(1000);
  });

  it('drops characters the model does not know', () => {
    expect(engine.tokenize('<en>Hi✓</en>').dropped).toEqual(['✓']);
  });
});
