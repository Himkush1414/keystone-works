// What the Reading section of Settings offers, apart from the screen so it can be tested in Node.

/** Text sizes (sp) offered in Settings; the reader clamps to its own bounds. */
export const READER_SIZES = [
  { value: 17, key: 'settings.readerSizeSmall' },
  { value: 19, key: 'settings.readerSizeMedium' },
  { value: 22, key: 'settings.readerSizeLarge' },
  { value: 26, key: 'settings.readerSizeLarger' },
] as const;
export const READER_LINE_HEIGHTS = [
  { value: 1.4, key: 'settings.readerLineCompact' },
  { value: 1.58, key: 'settings.readerLineComfortable' },
  { value: 1.8, key: 'settings.readerLineRelaxed' },
] as const;
/** The offered value nearest to a stored one (older versions could store others). */
export const nearest = (values: readonly number[], v: number): number =>
  values.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), values[0] ?? v);
