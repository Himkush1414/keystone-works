import { ImportError } from '@lamplight/core';
import { describe, expect, it } from 'vitest';
import { parseImport, titleFromName, usablePdfTitle, type ParseDeps } from '../src/import/parse';
import { failingPdfReader, fakePdfReader } from './fakePdf';

const utf8 = (s: string) => new TextEncoder().encode(s);
const noPdf: ParseDeps = { pdf: failingPdfReader('not expected') };

const line = (text: string, y: number, size = 11) => ({ text, x: 72, y, width: 400, size });
const pdfDoc = (title: string | null) => ({
  pages: [
    {
      width: 612,
      height: 792,
      lines: [line('Introduction', 100, 18), line('Reading aloud helps people follow long texts.', 140)],
    },
  ],
  title,
  author: '  Ada Lovelace ',
});

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof ImportError ? e.code : `other: ${String(e)}`;
  }
  return 'no error';
};

describe('titleFromName', () => {
  it('turns a file name into a readable title', () => {
    expect(titleFromName('my_paper-final.v2.pdf')).toBe('my paper final.v2');
    expect(titleFromName('/storage/emulated/0/Download/Notes.txt')).toBe('Notes');
    expect(titleFromName('.txt')).toBe('Untitled');
  });
});

describe('usablePdfTitle', () => {
  it('keeps real titles and drops tool-generated ones', () => {
    expect(usablePdfTitle(' On  Computable Numbers ')).toBe('On Computable Numbers');
    expect(usablePdfTitle('Microsoft Word - draft3.docx')).toBeUndefined();
    expect(usablePdfTitle('thesis.tex')).toBeUndefined();
    expect(usablePdfTitle('Untitled document')).toBeUndefined();
    expect(usablePdfTitle(null)).toBeUndefined();
  });
});

describe('parseImport', () => {
  it('reads plain text and Markdown with the file name as the fallback title', async () => {
    const text = await parseImport(
      { format: 'text', name: 'letter.txt', bytes: utf8('Dear reader,\n\nThis is a letter.') },
      noPdf,
    );
    expect(text.meta.title).toBe('letter');
    expect(text.blocks.map((b) => b.text)).toEqual(['Dear reader,', 'This is a letter.']);

    const md = await parseImport(
      { format: 'markdown', name: 'notes.md', bytes: utf8('# Heading\n\nSome *emphasis* here.') },
      noPdf,
    );
    expect(md.blocks.some((b) => b.kind === 'heading' && b.text === 'Heading')).toBe(true);
  });

  it('keeps the whole body of a local HTML file', async () => {
    const html =
      '<html><head><title>Saved page</title></head><body><header>Site nav</header><p>Short.</p></body></html>';
    const draft = await parseImport({ format: 'html', name: 'page.html', bytes: utf8(html) }, noPdf);
    expect(draft.meta).toMatchObject({ title: 'Saved page', kind: 'document' });
    expect(draft.blocks.map((b) => b.text)).toContain('Short.');
  });

  it('refuses an HTML file with no text', async () => {
    expect(
      await codeOf(parseImport({ format: 'html', name: 'x.html', bytes: utf8('<p> </p>') }, noPdf)),
    ).toBe('empty');
  });

  it('builds a PDF document from the native extraction', async () => {
    const pdf = fakePdfReader(pdfDoc('Microsoft Word - talk.docx'));
    const deps: ParseDeps = { pdf };
    const draft = await parseImport(
      {
        format: 'pdf',
        name: 'talk_notes.pdf',
        bytes: new Uint8Array(),
        path: '/files/a.pdf',
        password: 'pw',
      },
      deps,
    );
    expect(pdf.calls).toEqual(['open /files/a.pdf pw', 'pages 1-40', 'close']);
    expect(draft.meta).toMatchObject({ title: 'talk notes', author: 'Ada Lovelace' });
    expect(draft.blocks.map((b) => b.text).join(' ')).toContain('Reading aloud helps');
  });

  it('maps native PDF failures to import errors', async () => {
    const failing = (code: string): ParseDeps => ({ pdf: failingPdfReader(code) });
    const input = { format: 'pdf' as const, name: 'a.pdf', bytes: new Uint8Array(), path: '/a.pdf' };
    expect(await codeOf(parseImport(input, failing('password')))).toBe('password');
    expect(await codeOf(parseImport(input, failing('corrupt')))).toBe('corrupt');
    const scanned = fakePdfReader({ pages: [{ width: 612, height: 792, lines: [] }] });
    expect(await codeOf(parseImport(input, { pdf: scanned }))).toBe('scanned');
  });
});
