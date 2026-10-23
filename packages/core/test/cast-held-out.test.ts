import { describe, expect, it } from 'vitest';
import { scoreStory } from './castEval';
import { HELD_OUT } from './fixtures/castCorpus';

/** Accuracy on text Cast was never tuned on. Reported, and held at least at its first measurement. */
const FLOORS: Record<string, { named: number; consistent: number }> = {
  // First measurement, 2026-10-23 (voice 52% of 29 lines overall).
  'en-rain': { named: 0.5, consistent: 0.5 },
  'hi-family': { named: 0.5, consistent: 0.66 },
  'hinglish-chai': { named: 0.8, consistent: 0.8 },
  'en-sherlock': { named: 0.3, consistent: 0.3 },
};

describe('Cast attribution, held-out stories', () => {
  const scores = HELD_OUT.map(scoreStory);

  it('reports accuracy per story', () => {
    const total = scores.reduce((a, s) => ({ q: a.q + s.quotes, v: a.v + s.consistent }), { q: 0, v: 0 });
    const table = scores.map(
      (s) =>
        `${s.id.padEnd(16)} quotes ${String(s.quotes).padStart(3)}  named ${pct(s.named, s.quotes)}  voice ${pct(s.consistent, s.quotes)}  [${s.characters.join(', ')}]`,
    );
    process.stdout.write(
      `\n${table.join('\n')}\nall held-out: voice ${pct(total.v, total.q)} of ${total.q}\n`,
    );
    expect(scores).toHaveLength(HELD_OUT.length);
  });

  it.each(HELD_OUT.map((s) => s.id))('%s stays at or above its first measurement', (id) => {
    const s = scores.find((x) => x.id === id);
    const floor = FLOORS[id];
    if (!s || !floor) throw new Error(`no score or floor for ${id}`);
    expect(s.named / s.quotes).toBeGreaterThanOrEqual(floor.named);
    expect(s.consistent / s.quotes).toBeGreaterThanOrEqual(floor.consistent);
  });
});

const pct = (n: number, d: number) => `${Math.round((100 * n) / d)}%`.padStart(4);
