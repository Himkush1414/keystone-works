import { describe, expect, it } from 'vitest';
import { scoreStory } from './castEval';
import { FRESH } from './fixtures/castCorpus';

/** Accuracy on text Cast was never tuned on. Reported, and held at least at its first measurement. */
const FLOORS: Record<string, { named: number; consistent: number }> = {
  // Measured once, 2026-10-23: voice 94% of 18 lines (English 88%, Hindi 100%, Hinglish 100%).
  'en-classroom': { named: 0.75, consistent: 0.875 },
  'hi-night': { named: 1, consistent: 1 },
  'hinglish-exam': { named: 1, consistent: 1 },
};

describe('Cast attribution, fresh held-out stories (measured once)', () => {
  const scores = FRESH.map(scoreStory);

  it('reports accuracy per story', () => {
    const total = scores.reduce((a, s) => ({ q: a.q + s.quotes, v: a.v + s.consistent }), { q: 0, v: 0 });
    const table = scores.map(
      (s) =>
        `${s.id.padEnd(16)} quotes ${String(s.quotes).padStart(3)}  named ${pct(s.named, s.quotes)}  voice ${pct(s.consistent, s.quotes)}  [${s.characters.join(', ')}]`,
    );
    process.stdout.write(`\n${table.join('\n')}\nall fresh: voice ${pct(total.v, total.q)} of ${total.q}\n`);
    expect(scores).toHaveLength(FRESH.length);
  });

  it.each(FRESH.map((s) => s.id))('%s stays at or above its first measurement', (id) => {
    const s = scores.find((x) => x.id === id);
    const floor = FLOORS[id];
    if (!s || !floor) throw new Error(`no score or floor for ${id}`);
    expect(s.named / s.quotes).toBeGreaterThanOrEqual(floor.named);
    expect(s.consistent / s.quotes).toBeGreaterThanOrEqual(floor.consistent);
  });
});

const pct = (n: number, d: number) => `${Math.round((100 * n) / d)}%`.padStart(4);
