import type { VoiceStyle } from './assets';
import { prepareForModel } from './preprocess';
import { fnv1a, gaussian } from './rng';

/** The slice of the ONNX Runtime API the engine uses — satisfied by onnxruntime-node and onnxruntime-web. */
export interface OrtTensor {
  readonly data: unknown;
  readonly dims: readonly number[];
}
export interface OrtSession {
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
  release?(): Promise<void>;
}
export interface OrtModule {
  Tensor: new (
    type: 'float32' | 'int64',
    data: Float32Array | BigInt64Array,
    dims: readonly number[],
  ) => OrtTensor;
}

export interface EngineConfig {
  sampleRate: number;
  baseChunkSize: number;
  chunkCompressFactor: number;
  latentDim: number;
}

/** Reads the parts of tts.json the pipeline needs. */
export function configFromJson(json: unknown): EngineConfig {
  const j = json as {
    ae: { sample_rate: number; base_chunk_size: number };
    ttl: { chunk_compress_factor: number; latent_dim: number };
  };
  return {
    sampleRate: j.ae.sample_rate,
    baseChunkSize: j.ae.base_chunk_size,
    chunkCompressFactor: j.ttl.chunk_compress_factor,
    latentDim: j.ttl.latent_dim,
  };
}

export interface Sessions {
  durationPredictor: OrtSession;
  textEncoder: OrtSession;
  vectorEstimator: OrtSession;
  vocoder: OrtSession;
}

export interface SynthesisRequest {
  text: string;
  lang: string;
  voice: VoiceStyle;
  /** Flow-matching steps: 4 ≈ Live, 8 ≈ Studio, 12+ ≈ Studio+. */
  steps: number;
  /** Speaking rate multiplier baked into the audio (playback speed is applied separately). */
  rate?: number;
}

export interface SynthesisResult {
  samples: Float32Array;
  sampleRate: number;
  durationMs: number;
  /** Characters the model doesn't know, dropped before synthesis. */
  dropped: string[];
}

/** Seed for a sentence: the same text, voice and steps always produce the same audio. */
export const seedFor = (text: string, voiceId: string, steps: number) => fnv1a(`${voiceId}|${steps}|${text}`);

export class SupertonicEngine {
  constructor(
    private readonly ort: OrtModule,
    private readonly sessions: Sessions,
    private readonly config: EngineConfig,
    private readonly indexer: Int16Array,
  ) {}

  /** Model token ids for prepared text; unknown characters are dropped and reported. */
  tokenize(prepared: string): { ids: BigInt64Array; dropped: string[] } {
    const ids: bigint[] = [];
    const dropped: string[] = [];
    for (const ch of prepared) {
      const cp = ch.codePointAt(0) ?? 0;
      const id = cp < this.indexer.length ? (this.indexer[cp] ?? -1) : -1;
      if (id >= 0) ids.push(BigInt(id));
      else if (!dropped.includes(ch)) dropped.push(ch);
    }
    return { ids: BigInt64Array.from(ids), dropped };
  }

  async synthesize(req: SynthesisRequest): Promise<SynthesisResult> {
    const { Tensor } = this.ort;
    const cfg = this.config;
    const prepared = prepareForModel(req.text, req.lang);
    const { ids, dropped } = this.tokenize(prepared);
    const L = ids.length;
    const textIds = new Tensor('int64', ids, [1, L]);
    const textMask = new Tensor('float32', new Float32Array(L).fill(1), [1, 1, L]);
    const styleTtl = new Tensor('float32', req.voice.ttl.data, req.voice.ttl.dims);
    const styleDp = new Tensor('float32', req.voice.dp.data, req.voice.dp.dims);

    const dp = await this.sessions.durationPredictor.run({
      text_ids: textIds,
      style_dp: styleDp,
      text_mask: textMask,
    });
    const rawDuration = (dp.duration?.data as Float32Array | undefined)?.[0] ?? 0;
    const seconds = Math.max(0.05, rawDuration / (req.rate ?? 1.05));
    const te = await this.sessions.textEncoder.run({
      text_ids: textIds,
      style_ttl: styleTtl,
      text_mask: textMask,
    });
    const textEmb = te.text_emb;
    if (!textEmb) throw new Error('text encoder returned no text_emb');

    const chunk = cfg.baseChunkSize * cfg.chunkCompressFactor;
    const wavLen = Math.round(seconds * cfg.sampleRate);
    const T = Math.max(1, Math.ceil(wavLen / chunk));
    const D = cfg.latentDim * cfg.chunkCompressFactor;
    let latent = gaussian(new Float32Array(D * T), seedFor(req.text, req.voice.id, req.steps));
    const latentMask = new Tensor('float32', new Float32Array(T).fill(1), [1, 1, T]);
    const total = new Tensor('float32', Float32Array.of(req.steps), [1]);
    for (let k = 0; k < req.steps; k++) {
      const out = await this.sessions.vectorEstimator.run({
        noisy_latent: new Tensor('float32', latent, [1, D, T]),
        text_emb: textEmb,
        style_ttl: styleTtl,
        text_mask: textMask,
        latent_mask: latentMask,
        total_step: total,
        current_step: new Tensor('float32', Float32Array.of(k), [1]),
      });
      const next = out.denoised_latent?.data;
      if (!(next instanceof Float32Array)) throw new Error('vector estimator returned no denoised_latent');
      latent = next;
    }
    const voc = await this.sessions.vocoder.run({ latent: new Tensor('float32', latent, [1, D, T]) });
    const wav = voc.wav_tts?.data;
    if (!(wav instanceof Float32Array)) throw new Error('vocoder returned no wav_tts');
    const samples = wav.subarray(0, Math.min(wav.length, wavLen));
    return {
      samples,
      sampleRate: cfg.sampleRate,
      durationMs: (samples.length / cfg.sampleRate) * 1000,
      dropped,
    };
  }
}
