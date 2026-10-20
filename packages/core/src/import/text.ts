import { ImportError, type Block, type Chapter, type DocumentDraft, type DocumentKind } from '../model';

// prettier-ignore
const CP1252: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6,
  0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c,
  0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

/** Decodes UTF-8 (with or without BOM) and UTF-16 with BOM; falls back to Windows-1252 for invalid UTF-8. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return utf16(bytes.subarray(2), true);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return utf16(bytes.subarray(2), false);
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const decoded = utf8(bytes, start);
  if (decoded !== null) return decoded;
  let out = '';
  for (const b of bytes) out += String.fromCharCode(CP1252[b] ?? b);
  return out;
}

function utf16(bytes: Uint8Array, little: boolean): string {
  const units: number[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    units.push(
      little ? (bytes[i] ?? 0) | ((bytes[i + 1] ?? 0) << 8) : ((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0),
    );
  }
  let out = '';
  for (let i = 0; i < units.length; i += 8192) out += String.fromCharCode(...units.slice(i, i + 8192));
  return out;
}

/** Strict UTF-8 decoder; returns null on any invalid sequence. */
function utf8(bytes: Uint8Array, start: number): string | null {
  const cps: number[] = [];
  let out = '';
  for (let i = start; i < bytes.length;) {
    const b = bytes[i] ?? 0;
    let cp: number;
    let n: number;
    if (b < 0x80) {
      cp = b;
      n = 0;
    } else if (b >= 0xc2 && b < 0xe0) {
      cp = b & 0x1f;
      n = 1;
    } else if (b >= 0xe0 && b < 0xf0) {
      cp = b & 0x0f;
      n = 2;
    } else if (b >= 0xf0 && b < 0xf5) {
      cp = b & 0x07;
      n = 3;
    } else return null;
    for (let k = 1; k <= n; k++) {
      const c = bytes[i + k];
      if (c === undefined || (c & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (c & 0x3f);
    }
    if (
      (n === 2 && cp < 0x800) ||
      (n === 3 && (cp < 0x10000 || cp > 0x10ffff)) ||
      (cp >= 0xd800 && cp <= 0xdfff)
    ) {
      return null;
    }
    cps.push(cp);
    if (cps.length >= 8192) {
      out += String.fromCodePoint(...cps);
      cps.length = 0;
    }
    i += n + 1;
  }
  return out + String.fromCodePoint(...cps);
}

const CHAPTER_LINE =
  /^(?:chapter|part|book|volume|prologue|epilogue|kapitel|teil|capítulo|parte|libro|chapitre|partie|livre|capitolo|cap[ií]tulo|hoofdstuk|rozdział)\b[\s.:]*(?:[0-9]+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|[a-z]+)?\b.{0,80}$/iu;

/** Removes the Project Gutenberg licence header and footer when present. */
export function stripGutenberg(text: string): string {
  const start = /\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG E-?BOOK[^*]*\*{3}/iu.exec(text);
  const end = /\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG E-?BOOK[^*]*\*{3}/iu.exec(text);
  if (!start) return text;
  return text.slice(start.index + start[0].length, end && end.index > start.index ? end.index : undefined);
}

function isHeadingLine(para: string): boolean {
  if (para.includes('\n') || para.length > 90) return false;
  if (CHAPTER_LINE.test(para)) return true;
  const letters = para.replace(/[^\p{L}]/gu, '');
  return (
    letters.length >= 3 &&
    letters === letters.toUpperCase() &&
    letters !== letters.toLowerCase() &&
    !/[.!?,;]$/.test(para)
  );
}

function chaptersFromHeadings(blocks: readonly Block[]): Chapter[] {
  const heads = blocks
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.kind === 'heading' && (b.level ?? 1) === 1);
  if (heads.length < 2) return [{ title: heads[0]?.b.text ?? '', level: 1, blockStart: 0 }];
  return heads.map(({ b, i }, k) => ({ title: b.text, level: 1, blockStart: k === 0 ? 0 : i }));
}

/** Plain text: paragraphs at blank lines; chapter headings recognised; hard-wrapped lines rejoined. */
export function parsePlainText(
  input: string,
  title?: string,
  kind: DocumentKind = 'document',
): DocumentDraft {
  const text = stripGutenberg(input.replace(/\r\n?/g, '\n'));
  const paras = text
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!paras.length) throw new ImportError('empty');
  const blocks: Block[] = paras.map((p) =>
    isHeadingLine(p)
      ? { kind: 'heading', text: p.replace(/\s+/g, ' '), level: 1, skips: [] }
      : { kind: 'paragraph', text: p.replace(/\s*\n\s*/g, ' '), skips: [] },
  );
  const firstLine = paras[0]?.split('\n')[0]?.trim() ?? '';
  return {
    meta: {
      title: title ?? (firstLine.slice(0, 80) || 'Untitled'),
      kind: blocks.length > 400 ? 'book' : kind,
    },
    chapters: chaptersFromHeadings(blocks),
    blocks,
  };
}

/** Removes inline Markdown: emphasis, code spans, links (keeps text), images (dropped), HTML tags. */
export function stripInlineMarkdown(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(?<![\p{L}\p{N}])([*_])(?!\s)(.+?)(?<!\s)\1(?![\p{L}\p{N}])/gu, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Markdown: ATX/Setext headings, lists, quotes, fenced code, inline markup removed. */
export function parseMarkdown(input: string, title?: string): DocumentDraft {
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  let kind: Block['kind'] = 'paragraph';
  const flush = () => {
    const text = stripInlineMarkdown(para.join(' '));
    if (text) blocks.push({ kind, text, skips: [] });
    para = [];
    kind = 'paragraph';
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const fence = /^\s*(```|~~~)/.exec(line);
    if (fence) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !(lines[i] ?? '').trimStart().startsWith(fence[1] ?? '```'); i++)
        code.push(lines[i] ?? '');
      if (code.length) blocks.push({ kind: 'code', text: code.join('\n'), skips: [] });
      continue;
    }
    const atx = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (atx) {
      flush();
      const text = stripInlineMarkdown(atx[2] ?? '');
      if (text) blocks.push({ kind: 'heading', text, level: atx[1]?.length ?? 1, skips: [] });
      continue;
    }
    const next = lines[i + 1] ?? '';
    if (line.trim() && /^\s*(=+|-+)\s*$/.test(next) && !para.length) {
      blocks.push({
        kind: 'heading',
        text: stripInlineMarkdown(line),
        level: next.trim().startsWith('=') ? 1 : 2,
        skips: [],
      });
      i++;
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      continue;
    }
    const item = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      flush();
      kind = 'list';
      para.push(item[1] ?? '');
      flush();
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      if (kind !== 'quote') flush();
      kind = 'quote';
      para.push(quote[1] ?? '');
      continue;
    }
    if (kind === 'quote') flush();
    para.push(line.trim());
  }
  flush();
  if (!blocks.length) throw new ImportError('empty');
  const firstHeading = blocks.find((b) => b.kind === 'heading');
  return {
    meta: {
      title: title ?? firstHeading?.text ?? blocks[0]?.text.slice(0, 80) ?? 'Untitled',
      kind: 'document',
    },
    chapters: chaptersFromHeadings(blocks),
    blocks,
  };
}
