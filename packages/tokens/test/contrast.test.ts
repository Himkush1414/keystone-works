import { describe, expect, it } from 'vitest';
import { contrast, coverPalettes, cssVariables, palettes, parseColor, readerThemes } from '../src';

describe('contrast math', () => {
  it('matches WCAG reference values', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  it('composites translucent colours over the base', () => {
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    // A 50% black wash over white reads as mid grey.
    expect(contrast('#000000', 'rgba(0,0,0,0.5)', '#FFFFFF')).toBeGreaterThan(5);
  });

  it('rejects unknown formats', () => {
    expect(() => parseColor('hsl(0, 0%, 0%)')).toThrow();
  });
});

describe.each(['light', 'dark'] as const)('%s palette', (name) => {
  const p = palettes[name];

  it('body text meets AA (4.5:1) on every surface', () => {
    for (const bg of [p.bg, p.surface, p.surfaceSunk]) {
      expect(contrast(p.ink, bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(p.inkSoft, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('tertiary text and glyphs meet 3:1', () => {
    expect(contrast(p.inkFaint, p.bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.inkFaint, p.surface)).toBeGreaterThanOrEqual(3);
  });

  it('accent works as text on the background and as a button fill', () => {
    expect(contrast(p.accent, p.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.accentInk, p.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('status colours are readable', () => {
    expect(contrast(p.danger, p.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.success, p.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('text stays readable inside the current-sentence glow', () => {
    expect(contrast(p.ink, p.glow, p.bg)).toBeGreaterThanOrEqual(7);
  });
});

describe('reader themes', () => {
  it.each(Object.values(readerThemes))('$name keeps long-form text comfortable', (t) => {
    expect(contrast(t.ink, t.bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(t.inkSoft, t.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.ink, t.glow, t.bg)).toBeGreaterThanOrEqual(6);
    expect(contrast(t.underline, t.bg)).toBeGreaterThanOrEqual(3);
  });
});

describe('cover palettes', () => {
  it.each(coverPalettes.map((c, i) => [i, ...c] as const))('palette %i title is legible', (_i, bg, ink) => {
    expect(contrast(ink, bg)).toBeGreaterThanOrEqual(7);
  });
});

describe('css variables', () => {
  it('emits light, dark-media and explicit dark blocks', () => {
    const css = cssVariables();
    expect(css).toContain('--color-ink: #1C1915;');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(":root[data-theme='dark']");
    expect(css).toContain('--space-md: 16px;');
  });
});
