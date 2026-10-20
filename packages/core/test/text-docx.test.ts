import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseDocx } from '../src/import/docx';
import {
  decodeText,
  parseMarkdown,
  parsePlainText,
  stripGutenberg,
  stripInlineMarkdown,
} from '../src/import/text';
import { ImportError } from '../src/model';

describe('decodeText', () => {
  it('decodes UTF-8 with and without BOM', () => {
    expect(decodeText(strToU8('Café 灯 😀'))).toBe('Café 灯 😀');
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe('A');
  });
  it('decodes UTF-16 with BOM', () => {
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0xe9, 0x00]))).toBe('Aé');
    expect(decodeText(new Uint8Array([0xfe, 0xff, 0x00, 0x41]))).toBe('A');
  });
  it('falls back to Windows-1252 for invalid UTF-8', () => {
    expect(decodeText(new Uint8Array([0x93, 0x48, 0x69, 0x94, 0x20, 0x63, 0x61, 0x66, 0xe9]))).toBe(
      '“Hi” café',
    );
  });
});

describe('parsePlainText', () => {
  it('splits paragraphs, rejoins hard-wrapped lines and finds chapters', () => {
    const text =
      'THE QUIET LAMP\n\nCHAPTER I\n\nThe lamp was lit\nand the room was warm.\n\nShe read on.\n\nCHAPTER II\n\nMorning came.';
    const d = parsePlainText(text);
    expect(d.meta.title).toBe('THE QUIET LAMP');
    expect(d.blocks.map((b) => [b.kind, b.text])).toEqual([
      ['heading', 'THE QUIET LAMP'],
      ['heading', 'CHAPTER I'],
      ['paragraph', 'The lamp was lit and the room was warm.'],
      ['paragraph', 'She read on.'],
      ['heading', 'CHAPTER II'],
      ['paragraph', 'Morning came.'],
    ]);
    expect(d.chapters.map((c) => c.blockStart)).toEqual([0, 1, 4]);
  });

  it('strips the Project Gutenberg wrapper', () => {
    const t =
      'Licence blah\n*** START OF THE PROJECT GUTENBERG EBOOK LAMP ***\nReal text.\n*** END OF THE PROJECT GUTENBERG EBOOK LAMP ***\nMore licence';
    expect(stripGutenberg(t).trim()).toBe('Real text.');
    expect(parsePlainText(t).blocks.map((b) => b.text)).toEqual(['Real text.']);
  });

  it('rejects empty text', () => {
    expect(() => parsePlainText('  \n\n ')).toThrow(ImportError);
  });

  it('does not mistake shouting sentences for headings', () => {
    expect(parsePlainText('Intro.\n\nSTOP RIGHT THERE!').blocks[1]?.kind).toBe('paragraph');
  });
});

describe('Markdown', () => {
  it('strips inline markup', () => {
    expect(
      stripInlineMarkdown('**Bold** and _soft_ with `code`, a [link](http://x) and ![img](a.png).'),
    ).toBe('Bold and soft with code, a link and .');
    expect(stripInlineMarkdown('snake_case_name stays')).toBe('snake_case_name stays');
  });

  it('parses headings, lists, quotes and code', () => {
    const md =
      '# The Lamp\n\nIntro *text*\ncontinues.\n\n## Part\n\n- one\n- two\n\n> quoted\n> line\n\n```\nconst a = 1;\n```\n\nSetext\n------\n\n---\n\nEnd.';
    const d = parseMarkdown(md);
    expect(d.meta.title).toBe('The Lamp');
    expect(d.blocks.map((b) => [b.kind, b.text, b.level ?? null])).toEqual([
      ['heading', 'The Lamp', 1],
      ['paragraph', 'Intro text continues.', null],
      ['heading', 'Part', 2],
      ['list', 'one', null],
      ['list', 'two', null],
      ['quote', 'quoted line', null],
      ['code', 'const a = 1;', null],
      ['heading', 'Setext', 2],
      ['paragraph', 'End.', null],
    ]);
  });
});

function makeDocx(bodyXml: string, opts: { styles?: string; core?: string } = {}): Uint8Array {
  const w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(
      `<?xml version="1.0"?><w:document ${w}><w:body>${bodyXml}</w:body></w:document>`,
    ),
    ...(opts.styles ? { 'word/styles.xml': strToU8(`<w:styles ${w}>${opts.styles}</w:styles>`) } : {}),
    ...(opts.core
      ? {
          'docProps/core.xml': strToU8(
            `<cp:coreProperties xmlns:cp="x" xmlns:dc="http://purl.org/dc/elements/1.1/">${opts.core}</cp:coreProperties>`,
          ),
        }
      : {}),
  });
}

const p = (t: string, style?: string, extra = '') =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/>${extra}</w:pPr>` : ''}<w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;

describe('parseDocx', () => {
  it('reads headings from styles, paragraphs, lists, quotes and tables', () => {
    const styles =
      '<w:style w:styleId="Ttulo1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style><w:style w:styleId="Cita"><w:name w:val="Quote"/></w:style>';
    const body = [
      p('First Part', 'Ttulo1'),
      `<w:p><w:r><w:t>Light </w:t></w:r><w:r><w:t>falls</w:t></w:r><w:r><w:footnoteReference w:id="1"/></w:r><w:r><w:tab/><w:t>softly.</w:t></w:r></w:p>`,
      p('Said simply.', 'Cita'),
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>An item</w:t></w:r></w:p>`,
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B1</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
      p('Second Part', 'Ttulo1'),
      `<w:p><w:r><w:t>Kept</w:t></w:r><w:del><w:r><w:t>Deleted</w:t></w:r></w:del></w:p>`,
    ].join('');
    const d = parseDocx(
      makeDocx(body, { styles, core: '<dc:title>Lamp Notes</dc:title><dc:creator>Ada</dc:creator>' }),
    );
    expect(d.meta).toMatchObject({ title: 'Lamp Notes', author: 'Ada', kind: 'document' });
    expect(d.blocks.map((b) => [b.kind, b.text])).toEqual([
      ['heading', 'First Part'],
      ['paragraph', 'Light falls softly.'],
      ['quote', 'Said simply.'],
      ['list', 'An item'],
      ['paragraph', 'A1, B1'],
      ['heading', 'Second Part'],
      ['paragraph', 'Kept'],
    ]);
    expect(d.chapters.map((c) => c.title)).toEqual(['First Part', 'Second Part']);
  });

  it('recognises built-in heading style names without styles.xml', () => {
    const d = parseDocx(makeDocx(p('Big', 'Heading1') + p('Body')));
    expect(d.blocks[0]).toMatchObject({ kind: 'heading', level: 1 });
    expect(d.meta.title).toBe('Big');
  });

  it('reports missing or empty documents', () => {
    expect(() => parseDocx(zipSync({ 'a.txt': strToU8('x') }))).toThrow(/corrupt/);
    expect(() => parseDocx(makeDocx('<w:p/>'))).toThrow(/empty/);
  });
});
