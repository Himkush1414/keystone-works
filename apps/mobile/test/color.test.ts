import { palettes, readerThemes } from '@lamplight/tokens';
import { describe, expect, it } from 'vitest';
import { focusInk } from '../src/player/readAlong';
import { isDarkColor, mixColor } from '../src/theme/color';

describe('isDarkColor', () => {
  it('tells the app palettes apart', () => {
    expect(isDarkColor(palettes.light.bg)).toBe(false);
    expect(isDarkColor(palettes.dark.bg)).toBe(true);
  });

  it('reads every reader theme the way its text is drawn', () => {
    for (const theme of Object.values(readerThemes))
      expect(isDarkColor(theme.bg)).toBe(!isDarkColor(theme.ink));
  });

  it('handles short hex and rejects junk as light', () => {
    expect(isDarkColor('#000')).toBe(true);
    expect(isDarkColor('#fff')).toBe(false);
    expect(isDarkColor('oops')).toBe(false);
  });
});

describe('mixColor', () => {
  it('moves one colour toward another', () => {
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColor('#123', '#123', 0.7)).toBe('#112233');
    expect(mixColor('#ff0000', '#0000ff', 1)).toBe('#0000ff');
  });

  it('clamps the amount and leaves colours it cannot read alone', () => {
    expect(mixColor('#000000', '#ffffff', 2)).toBe('#ffffff');
    expect(mixColor('red', '#ffffff', 0.5)).toBe('red');
  });

  it('dims reader text for line focus but keeps it at 3:1 against its page', () => {
    const lum = (hex: string) => {
      const n = Number.parseInt(hex.slice(1), 16);
      const c = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
      return 0.2126 * c((n >> 16) & 255) + 0.7152 * c((n >> 8) & 255) + 0.0722 * c(n & 255);
    };
    const contrast = (a: string, b: string) =>
      (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    for (const theme of Object.values(readerThemes)) {
      const faded = focusInk(theme);
      expect(contrast(faded, theme.bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(faded, theme.bg)).toBeLessThan(contrast(theme.ink, theme.bg) / 2);
    }
  });
});
