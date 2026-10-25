import { palettes, readerThemes } from '@lamplight/tokens';
import { describe, expect, it } from 'vitest';
import { isDarkColor } from '../src/theme/color';

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
