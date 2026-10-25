import { describe, expect, it } from 'vitest';
import { scoreBook, tapsToFix, type BookScore } from './castEval';
import { CAST_BOOKS } from './fixtures/castBooks';

const pct = (a: number, b: number) => `${b ? Math.round((a / b) * 100) : 0}%`.padStart(4);

describe('Cast on real books', () => {
  const scores: BookScore[] = CAST_BOOKS.map(scoreBook);

  it('reports how many lines of dialogue go to the right character', () => {
    const rows = scores.map(
      (s) =>
        `${s.id.padEnd(22)} lines ${String(s.lines).padStart(3)}  found ${pct(s.detected, s.lines)}  named ${pct(s.named, s.lines)}  voiced ${pct(s.voiced, s.lines)}  spurious ${s.spurious}`,
    );
    const sum = (k: keyof Omit<BookScore, 'id'>, lang?: string) =>
      scores.filter((s) => !lang || s.id.startsWith(lang)).reduce((n, s) => n + s[k], 0);
    for (const lang of ['en', 'hi']) {
      rows.push(
        `all ${lang}                 lines ${String(sum('lines', lang)).padStart(3)}  found ${pct(sum('detected', lang), sum('lines', lang))}  named ${pct(sum('named', lang), sum('lines', lang))}  voiced ${pct(sum('voiced', lang), sum('lines', lang))}  spurious ${sum('spurious', lang)}`,
      );
    }
    process.stdout.write(`\n${rows.join('\n')}\n`);
    expect(sum('lines')).toBe(204);
  });

  it('fixes most of the rest with fewer taps than wrong lines, as a correction flips the guesses after it', () => {
    const rows = CAST_BOOKS.map((b) => ({ id: b.id, ...tapsToFix(b) }));
    process.stdout.write(
      `\n${rows.map((r) => `${r.id.padEnd(22)} wrong ${String(r.wrong).padStart(2)}  taps to fix ${r.taps}`).join('\n')}\n`,
    );
    const wrong = rows.reduce((n, r) => n + r.wrong, 0);
    const taps = rows.reduce((n, r) => n + r.taps, 0);
    expect(taps).toBeLessThan(wrong);
  });
});
