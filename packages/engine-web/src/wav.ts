/** Encodes mono float samples as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    v.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return new Uint8Array(buf);
}

/** Median fundamental frequency (Hz) of voiced frames — used to describe voices objectively. */
export function medianPitch(samples: Float32Array, sampleRate: number): number {
  const frame = Math.round(sampleRate * 0.04);
  const minLag = Math.round(sampleRate / 400);
  const maxLag = Math.round(sampleRate / 60);
  const pitches: number[] = [];
  for (let start = 0; start + frame + maxLag < samples.length; start += frame) {
    let energy = 0;
    for (let i = 0; i < frame; i++) energy += (samples[start + i] ?? 0) ** 2;
    if (energy / frame < 1e-4) continue;
    let bestLag = 0;
    let best = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let c = 0;
      for (let i = 0; i < frame; i++) c += (samples[start + i] ?? 0) * (samples[start + i + lag] ?? 0);
      if (c > best) {
        best = c;
        bestLag = lag;
      }
    }
    if (bestLag && best / energy > 0.5) pitches.push(sampleRate / bestLag);
  }
  if (!pitches.length) return 0;
  pitches.sort((a, b) => a - b);
  return pitches[pitches.length >> 1] ?? 0;
}
