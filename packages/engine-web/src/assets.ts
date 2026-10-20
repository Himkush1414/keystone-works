/**
 * Compact binary formats for the engine's small assets, shared by the app (Kotlin reader) and the web demo.
 *
 * Unicode indexer (`indexer.bin`): "LPI1" | u32 length | i16[length] little-endian (−1 = unsupported).
 * Voice styles (`voices.bin`):       "LVS1" | u32 count | per voice: u8 idLen | id (ASCII) |
 *                                    u32 ttlDims[3] | u32 dpDims[3] | f32 ttl[...] | f32 dp[...]   (little-endian)
 */

export interface StyleTensor {
  dims: [number, number, number];
  data: Float32Array;
}

export interface VoiceStyle {
  id: string;
  ttl: StyleTensor;
  dp: StyleTensor;
}

const MAGIC_INDEXER = 'LPI1';
const MAGIC_VOICES = 'LVS1';

function writeMagic(view: DataView, at: number, magic: string): number {
  for (let i = 0; i < 4; i++) view.setUint8(at + i, magic.charCodeAt(i));
  return at + 4;
}

function readMagic(view: DataView, at: number, magic: string): number {
  let m = '';
  for (let i = 0; i < 4; i++) m += String.fromCharCode(view.getUint8(at + i));
  if (m !== magic) throw new Error(`Bad asset header: expected ${magic}, got ${m}`);
  return at + 4;
}

export function packIndexer(indexer: readonly number[]): Uint8Array {
  const buf = new ArrayBuffer(8 + indexer.length * 2);
  const view = new DataView(buf);
  let at = writeMagic(view, 0, MAGIC_INDEXER);
  view.setUint32(at, indexer.length, true);
  at += 4;
  for (const v of indexer) {
    view.setInt16(at, v, true);
    at += 2;
  }
  return new Uint8Array(buf);
}

export function unpackIndexer(bytes: Uint8Array): Int16Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = readMagic(view, 0, MAGIC_INDEXER);
  const n = view.getUint32(at, true);
  at += 4;
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++, at += 2) out[i] = view.getInt16(at, true);
  return out;
}

/** Parses a voice style JSON file from the Hugging Face release ({ style_ttl, style_dp }). */
export function voiceFromJson(id: string, json: unknown): VoiceStyle {
  const j = json as Record<string, { dims: number[]; data: unknown[] }>;
  const tensor = (k: string): StyleTensor => {
    const t = j[k];
    if (!t || t.dims.length !== 3) throw new Error(`Voice ${id}: missing ${k}`);
    const data = Float32Array.from((t.data as unknown[]).flat(Infinity) as number[]);
    const dims = t.dims as [number, number, number];
    if (data.length !== dims[0] * dims[1] * dims[2]) throw new Error(`Voice ${id}: ${k} size mismatch`);
    return { dims, data };
  };
  return { id, ttl: tensor('style_ttl'), dp: tensor('style_dp') };
}

export function packVoices(voices: readonly VoiceStyle[]): Uint8Array {
  const size =
    8 + voices.reduce((n, v) => n + 1 + v.id.length + 24 + (v.ttl.data.length + v.dp.data.length) * 4, 0);
  const buf = new ArrayBuffer(size);
  const view = new DataView(buf);
  let at = writeMagic(view, 0, MAGIC_VOICES);
  view.setUint32(at, voices.length, true);
  at += 4;
  for (const v of voices) {
    view.setUint8(at++, v.id.length);
    for (let i = 0; i < v.id.length; i++) view.setUint8(at++, v.id.charCodeAt(i));
    for (const d of [...v.ttl.dims, ...v.dp.dims]) {
      view.setUint32(at, d, true);
      at += 4;
    }
    for (const x of v.ttl.data) {
      view.setFloat32(at, x, true);
      at += 4;
    }
    for (const x of v.dp.data) {
      view.setFloat32(at, x, true);
      at += 4;
    }
  }
  return new Uint8Array(buf);
}

export function unpackVoices(bytes: Uint8Array): VoiceStyle[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = readMagic(view, 0, MAGIC_VOICES);
  const count = view.getUint32(at, true);
  at += 4;
  const out: VoiceStyle[] = [];
  for (let k = 0; k < count; k++) {
    const len = view.getUint8(at++);
    let id = '';
    for (let i = 0; i < len; i++) id += String.fromCharCode(view.getUint8(at++));
    const dims: number[] = [];
    for (let i = 0; i < 6; i++, at += 4) dims.push(view.getUint32(at, true));
    const read = (n: number) => {
      const a = new Float32Array(n);
      for (let i = 0; i < n; i++, at += 4) a[i] = view.getFloat32(at, true);
      return a;
    };
    const [t0 = 0, t1 = 0, t2 = 0, d0 = 0, d1 = 0, d2 = 0] = dims;
    const ttl = { dims: [t0, t1, t2] as [number, number, number], data: read(t0 * t1 * t2) };
    const dp = { dims: [d0, d1, d2] as [number, number, number], data: read(d0 * d1 * d2) };
    out.push({ id, ttl, dp });
  }
  return out;
}
