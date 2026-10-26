import { describe, expect, it } from 'vitest';
import { nearest, READER_LINE_HEIGHTS, READER_SIZES } from '../src/settings/reading';
import { DEFAULT_SETTINGS } from '../src/state/settings';

describe('reading settings', () => {
  it('offers the default size and spacing, so a fresh install shows one selected', () => {
    expect(READER_SIZES.map((x) => x.value)).toContain(DEFAULT_SETTINGS.readerSize);
    expect(READER_LINE_HEIGHTS.map((x) => x.value)).toContain(DEFAULT_SETTINGS.readerLineHeight);
  });

  it('selects the nearest offered value for one stored by an older version', () => {
    expect(nearest([17, 19, 22, 26], 20)).toBe(19);
    expect(nearest([17, 19, 22, 26], 30)).toBe(26);
    expect(nearest([1.4, 1.58, 1.8], 1.5)).toBe(1.58);
  });
});
