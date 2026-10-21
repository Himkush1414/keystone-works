import { ImportError } from '@lamplight/core';
import { describe, expect, it } from 'vitest';
import { detectFormat, MAX_IMPORT_BYTES } from '../src/import/format';

const bytes = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

/** A ZIP local file header for `name` followed by `content` (stored), as the first entry. */
function zip(name: string, content = ''): Uint8Array {
  const header = new Uint8Array(30);
  header.set([0x50, 0x4b, 0x03, 0x04]);
  header[26] = name.length;
  return new Uint8Array([...header, ...bytes(name), ...bytes(content)]);
}

const epub = zip('mimetype', 'application/epub+zip');
const docx = new Uint8Array([
  ...zip('[Content_Types].xml', '<Types/>'.padEnd(4000, ' ')),
  ...zip('word/document.xml', '<w:document/>'),
]);
const pdf = bytes('%PDF-1.7\n1 0 obj');

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof ImportError ? e.code : String(e);
  }
  return 'no error';
};

describe('detectFormat', () => {
  it('reads the format from the bytes, whatever the file is called', () => {
    expect(detectFormat({ name: 'download', bytes: pdf })).toBe('pdf');
    expect(detectFormat({ name: 'book.zip', bytes: epub })).toBe('epub');
    expect(detectFormat({ name: 'Report (1)', mime: 'application/octet-stream', bytes: docx })).toBe('docx');
  });

  it('uses the name, then the MIME type, for text formats', () => {
    const text = bytes('# Title\n\nSome words.');
    expect(detectFormat({ name: 'notes.md', bytes: text })).toBe('markdown');
    expect(detectFormat({ name: 'Notes.MARKDOWN', bytes: text })).toBe('markdown');
    expect(detectFormat({ name: 'page.htm', bytes: bytes('<p>hi</p>') })).toBe('html');
    expect(detectFormat({ name: 'shared', mime: 'text/markdown; charset=utf-8', bytes: text })).toBe(
      'markdown',
    );
    expect(detectFormat({ name: 'shared', mime: 'text/plain', bytes: text })).toBe('text');
  });

  it('falls back to looking at the content when nothing else says', () => {
    expect(detectFormat({ name: 'clip', bytes: bytes('Just some words, nothing more.') })).toBe('text');
    expect(detectFormat({ name: 'clip', bytes: bytes('<!DOCTYPE html><html><body>x') })).toBe('html');
    expect(detectFormat({ name: 'clip', bytes: new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]) })).toBe(
      'text',
    );
  });

  it('refuses DRM formats and formats without an importer', () => {
    expect(code(() => detectFormat({ name: 'Novel.azw3', bytes: bytes('x') }))).toBe('drm');
    expect(code(() => detectFormat({ name: 'loan.acsm', bytes: bytes('<fulfillmentToken>') }))).toBe('drm');
    expect(code(() => detectFormat({ name: 'old.doc', bytes: bytes('x') }))).toBe('unsupported');
    expect(
      code(() => detectFormat({ name: 'photo', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]) })),
    ).toBe('unsupported');
    expect(code(() => detectFormat({ name: 'archive.zip', bytes: zip('readme.txt', 'hi') }))).toBe(
      'unsupported',
    );
  });

  it('trusts a ZIP that the name or type calls an EPUB when the first entry is unusual', () => {
    expect(detectFormat({ name: 'book.epub', bytes: zip('META-INF/container.xml') })).toBe('epub');
  });

  it('reports a binary format whose bytes do not match as corrupt', () => {
    expect(code(() => detectFormat({ name: 'paper.pdf', bytes: bytes('<html>error page</html>') }))).toBe(
      'corrupt',
    );
  });

  it('refuses files over the size limit before looking at them', () => {
    const big = { length: MAX_IMPORT_BYTES + 1 } as Uint8Array;
    expect(code(() => detectFormat({ name: 'big.pdf', bytes: big }))).toBe('tooLarge');
  });
});
