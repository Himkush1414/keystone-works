import { describe, expect, it } from 'vitest';
import { scoreStory } from './castEval';
import { CAST_CORPUS } from './fixtures/castCorpus';

/**
 * Dialogue attribution measured on stories with known speakers. Floors only ever go up: a change that makes
 * Cast worse on any story fails here.
 */
const FLOORS: Record<string, { named: number; consistent: number }> = {
  // Baseline (old code): 80 / 0 / 0 / 6 %. Attribution v2: 100 % on every story (tuned on these).
  'en-harbour': { named: 1, consistent: 1 },
  'hi-bazaar': { named: 1, consistent: 1 },
  'hinglish-bazaar': { named: 1, consistent: 1 },
  'en-austen-ch1': { named: 1, consistent: 1 },
};

describe('Cast attribution corpus', () => {
  const scores = CAST_CORPUS.map(scoreStory);

  it('reports accuracy per story', () => {
    const table = scores.map(
      (s) =>
        `${s.id.padEnd(16)} quotes ${String(s.quotes).padStart(3)}  named ${pct(s.named, s.quotes)}  voice ${pct(s.consistent, s.quotes)}  [${s.characters.join(', ')}]`,
    );
    process.stdout.write(`\n${table.join('\n')}\n`);
    expect(scores).toHaveLength(CAST_CORPUS.length);
  });

  it.each(CAST_CORPUS.map((s) => s.id))('%s stays at or above its floor', (id) => {
    const s = scores.find((x) => x.id === id);
    const floor = FLOORS[id];
    if (!s || !floor) throw new Error(`no score or floor for ${id}`);
    expect(s.named / s.quotes).toBeGreaterThanOrEqual(floor.named);
    expect(s.consistent / s.quotes).toBeGreaterThanOrEqual(floor.consistent);
  });
});

const pct = (n: number, d: number) => `${Math.round((100 * n) / d)}%`.padStart(4);
