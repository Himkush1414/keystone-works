import { describe, expect, it } from 'vitest';
import { formatBytes } from '../src/settings/storage';

describe('formatBytes', () => {
  it('shows megabytes, then gigabytes with one decimal, in the reader’s number format', () => {
    expect(formatBytes('en', 0)).toBe('0 MB');
    expect(formatBytes('en', 12.4 * 1024 * 1024)).toBe('12 MB');
    expect(formatBytes('en', 1023 * 1024 * 1024)).toBe('1,023 MB');
    expect(formatBytes('en', 1.44 * 1024 ** 3)).toBe('1.4 GB');
    expect(formatBytes('de', 1.44 * 1024 ** 3)).toBe('1,4 GB');
    expect(formatBytes('en', -5)).toBe('0 MB');
  });
});
