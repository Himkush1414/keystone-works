import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseEpub } from '../src/import/epub';
import { readZip, resolveHref, safePath } from '../src/import/zip';
import { ImportError } from '../src/model';
import { makeEpub } from './fixtures/epub';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof ImportError ? e.code : 'other';
  }
  return null;
};

describe('zip safety', () => {
  it('normalises paths and rejects escapes', () => {
    expect(safePath('OEBPS/./text/../ch1.xhtml')).toBe('OEBPS/ch1.xhtml');
    expect(safePath('../evil')).toBeNull();
    expect(safePath('/')).toBeNull();
    expect(safePath('C:/windows')).toBeNull();
    expect(resolveHref('OEBPS/content.opf', 'text/ch%201.xhtml#p2')).toEqual({
      path: 'OEBPS/text/ch 1.xhtml',
      fragment: 'p2',
    });
    expect(resolveHref('OEBPS/content.opf', 'https://example.com/x')).toEqual({ path: null });
    expect(resolveHref('OEBPS/content.opf', '../../../etc/passwd').path).toBeNull();
  });

  it('drops unsafe entries and enforces limits', () => {
    const zip = zipSync({ 'a.txt': strToU8('a'), '../b.txt': strToU8('b') });
    expect([...readZip(zip).keys()]).toEqual(['a.txt']);
    const many = zipSync(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`f${i}`, strToU8('x')])));
    expect(
      code(() => readZip(many, { maxEntries: 10, maxEntryBytes: 1e9, maxTotalBytes: 1e9, maxRatio: 1e9 })),
    ).toBe('tooLarge');
    const bomb = zipSync({ big: new Uint8Array(5_000_000) });
    expect(code(() => readZip(bomb))).toBe('tooLarge');
  });

  it('reports garbage as corrupt', () => {
    expect(code(() => readZip(new Uint8Array([1, 2, 3, 4])))).toBe('corrupt');
  });
});

describe('parseEpub', () => {
  it('reads an EPUB 3 with nav, metadata and cover', () => {
    const d = parseEpub(makeEpub({ version: 3, cover: true }));
    expect(d.meta).toMatchObject({
      title: 'The Quiet Lamp',
      author: 'Ada Reed',
      language: 'en',
      kind: 'book',
    });
    expect(d.meta.cover?.mime).toBe('image/jpeg');
    expect(d.blocks.map((b) => b.text)).toEqual([
      'Chapter One',
      'The lamp was lit.',
      '“Who is there?” she asked.',
      'Chapter Two',
      'Morning came slowly.',
    ]);
    expect(d.chapters).toEqual([
      { title: 'Chapter One', level: 1, blockStart: 0 },
      { title: 'Chapter Two', level: 1, blockStart: 3 },
    ]);
  });

  it('reads an EPUB 2 with an NCX and a meta cover', () => {
    const d = parseEpub(makeEpub({ version: 2, cover: true }));
    expect(d.chapters.map((c) => c.title)).toEqual(['Chapter One', 'Chapter Two']);
    expect(d.meta.cover?.data.length).toBe(7);
  });

  it('falls back to headings when there is no table of contents', () => {
    const d = parseEpub(makeEpub({ omitToc: true }));
    expect(d.chapters.map((c) => [c.title, c.blockStart])).toEqual([
      ['Chapter One', 0],
      ['Chapter Two', 3],
    ]);
  });

  it('maps several TOC entries in one file to their headings', () => {
    const d = parseEpub(
      makeEpub({
        chapters: [
          {
            file: 'all.xhtml',
            title: 'Part One',
            html: '<h1 id="a">Part One</h1><p>One.</p><h1 id="b">Part Two</h1><p>Two.</p>',
          },
        ],
        extra: {},
      }),
    );
    expect(d.chapters[0]?.title).toBe('Part One');
  });

  it('refuses DRM-protected books but accepts font obfuscation', () => {
    expect(code(() => parseEpub(makeEpub({ extra: { 'META-INF/rights.xml': '<rights/>' } })))).toBe('drm');
    const adept =
      '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/><enc:CipherData><enc:CipherReference URI="OEBPS/text/ch1.xhtml"/></enc:CipherData></enc:EncryptedData></encryption>';
    expect(code(() => parseEpub(makeEpub({ extra: { 'META-INF/encryption.xml': adept } })))).toBe('drm');
    const fonts =
      '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/><enc:CipherData><enc:CipherReference URI="OEBPS/fonts/a.otf"/></enc:CipherData></enc:EncryptedData></encryption>';
    expect(
      parseEpub(makeEpub({ extra: { 'META-INF/encryption.xml': fonts } })).blocks.length,
    ).toBeGreaterThan(0);
  });

  it('reports broken packages', () => {
    expect(code(() => parseEpub(zipSync({ 'a.txt': strToU8('x') })))).toBe('corrupt');
    expect(code(() => parseEpub(makeEpub({ chapters: [{ file: 'e.xhtml', title: 'E', html: '' }] })))).toBe(
      'empty',
    );
  });

  it('uses the fallback title and copes with missing authors', () => {
    const d = parseEpub(makeEpub({ title: '', author: '' }), 'my-file');
    expect(d.meta.title).toBe('my-file');
    expect(d.meta.author).toBeUndefined();
  });
});
