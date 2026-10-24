import { palettes } from '@lamplight/tokens';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('app.config colours', () => {
  // app.config.ts can't import the tokens package (it's read before any JS is bundled), so it repeats them.
  const config = readFileSync(new URL('../app.config.ts', import.meta.url), 'utf8');
  it('match the palettes', () => {
    expect(config).toContain(`const PAPER = '${palettes.light.bg}'`);
    expect(config).toContain(`const NIGHT = '${palettes.dark.bg}'`);
    expect(config).toContain(`const ACCENT = '${palettes.light.accent}'`);
  });
});
