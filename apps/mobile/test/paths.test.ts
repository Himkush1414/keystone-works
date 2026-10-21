import { describe, expect, it } from 'vitest';
import { coverExtension, PICKER_TYPES, uriToPath } from '../src/import/paths';

describe('uriToPath', () => {
  it('turns a file URI into a decoded path for native code', () => {
    expect(uriToPath('file:///data/user/0/app/cache/My%20Book%20(1).pdf')).toBe(
      '/data/user/0/app/cache/My Book (1).pdf',
    );
    expect(uriToPath('/already/a/path.pdf')).toBe('/already/a/path.pdf');
  });

  it('keeps a path with a stray percent sign rather than throwing', () => {
    expect(uriToPath('file:///cache/100%.txt')).toBe('/cache/100%.txt');
  });
});

describe('coverExtension', () => {
  it('maps image types and falls back for unknown ones', () => {
    expect(coverExtension('image/JPEG')).toBe('jpg');
    expect(coverExtension('image/png')).toBe('png');
    expect(coverExtension('image/x-unknown')).toBe('img');
  });
});

describe('PICKER_TYPES', () => {
  it('offers every format the importers read, plus octet-stream for misnamed files', () => {
    expect(PICKER_TYPES).toEqual(
      expect.arrayContaining([
        'application/epub+zip',
        'application/pdf',
        'text/markdown',
        'application/octet-stream',
      ]),
    );
  });
});
