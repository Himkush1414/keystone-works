/**
 * Seeded noise for flow matching. The same algorithm is implemented in Kotlin (engine-core Seed.kt) so a given
 * sentence renders the same audio on every platform — that is how cached audio stays valid and how the
 * Kotlin port is checked against this reference.
 */

/** FNV-1a over UTF-16 code units, 32-bit. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, good enough statistical quality for noise. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fills `out` with standard normal samples (Box–Muller, pairs). */
export function gaussian(out: Float32Array, seed: number): Float32Array {
  const rnd = mulberry32(seed);
  for (let i = 0; i < out.length; i += 2) {
    const u1 = Math.max(1e-10, rnd());
    const u2 = rnd();
    const r = Math.sqrt(-2 * Math.log(u1));
    out[i] = r * Math.cos(2 * Math.PI * u2);
    if (i + 1 < out.length) out[i + 1] = r * Math.sin(2 * Math.PI * u2);
  }
  return out;
}
