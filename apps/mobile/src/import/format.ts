import { ImportError } from '@lamplight/core';

/** The importers Lamplight has, one per parser in packages/core. */
export type ImportFormat = 'epub' | 'pdf' | 'docx' | 'html' | 'markdown' | 'text';

/** Imports above this size are refused before they are read into memory. */
export const MAX_IMPORT_BYTES = 200 * 1024 * 1024;

const EXTENSIONS: Record<string, ImportFormat> = {
  epub: 'epub',
  pdf: 'pdf',
  docx: 'docx',
  html: 'html',
  htm: 'html',
  xhtml: 'html',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'text',
  text: 'text',
};

const MIME_TYPES: Record<string, ImportFormat> = {
  'application/epub+zip': 'epub',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/html': 'html',
  'application/xhtml+xml': 'html',
  'text/markdown': 'markdown',
  'text/x-markdown': 'markdown',
  'text/plain': 'text',
};

/** Formats people try that we can't read, with the reason the UI explains. */
const REFUSED_EXTENSIONS: Record<string, 'drm' | 'unsupported'> = {
  azw: 'drm',
  azw3: 'drm',
  kfx: 'drm',
  acsm: 'drm',
  mobi: 'unsupported',
  doc: 'unsupported',
  rtf: 'unsupported',
  odt: 'unsupported',
  pages: 'unsupported',
};

const ascii = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...bytes.subarray(from, Math.min(to, bytes.length)));

/** True when `needle` (ASCII) occurs in the first `limit` bytes. */
function hasAscii(bytes: Uint8Array, needle: string, limit: number): boolean {
  const n = Math.min(bytes.length, limit) - needle.length;
  outer: for (let i = 0; i <= n; i++) {
    for (let k = 0; k < needle.length; k++) if (bytes[i + k] !== needle.charCodeAt(k)) continue outer;
    return true;
  }
  return false;
}

/** Format from the file's own bytes, when they say: PDF header, or a ZIP whose first entry names it. */
function sniff(bytes: Uint8Array): ImportFormat | 'zip' | null {
  if (ascii(bytes, 0, 1024).includes('%PDF-')) return 'pdf';
  if (ascii(bytes, 0, 4) === 'PK\u0003\u0004') {
    // EPUB stores "mimetype" first, uncompressed: the type string follows the 30-byte header and the name.
    if (ascii(bytes, 30, 38) === 'mimetype' && ascii(bytes, 38, 58) === 'application/epub+zip') return 'epub';
    // Word files start with [Content_Types].xml; the word/ entries follow within the first few KB.
    if (hasAscii(bytes, 'word/document.xml', 64 * 1024)) return 'docx';
    return 'zip';
  }
  return null;
}

const extensionOf = (name: string) => /\.([a-z0-9]+)$/i.exec(name.trim())?.[1]?.toLowerCase() ?? '';

/**
 * Decides which importer reads a file. The bytes win over the name (shared files are often misnamed), the
 * name wins over the MIME type (Android reports octet-stream for most files). Throws ImportError with
 * `drm`, `unsupported` or `tooLarge`.
 */
export function detectFormat(input: { name: string; mime?: string | null; bytes: Uint8Array }): ImportFormat {
  if (input.bytes.length > MAX_IMPORT_BYTES) throw new ImportError('tooLarge');
  const ext = extensionOf(input.name);
  const refused = REFUSED_EXTENSIONS[ext];
  if (refused) throw new ImportError(refused);

  const sniffed = sniff(input.bytes);
  if (sniffed === 'pdf' || sniffed === 'epub' || sniffed === 'docx') return sniffed;
  const byName = EXTENSIONS[ext];
  const byMime = MIME_TYPES[(input.mime ?? '').split(';')[0]?.trim().toLowerCase() ?? ''];
  if (sniffed === 'zip') {
    // A ZIP we couldn't identify from its first entry: trust a name or type that says EPUB or DOCX.
    const claimed = byName ?? byMime;
    if (claimed === 'epub' || claimed === 'docx') return claimed;
    throw new ImportError('unsupported');
  }
  if (byName === 'pdf' || byName === 'epub' || byName === 'docx') throw new ImportError('corrupt');
  const textual = byName ?? byMime;
  if (textual) return textual;
  if (looksLikeText(input.bytes))
    return /^\s*<(!doctype html|html)/i.test(ascii(input.bytes, 0, 256)) ? 'html' : 'text';
  throw new ImportError('unsupported');
}

/** True when the first 4 KB has no NUL bytes and few control characters: plain text in some encoding. */
function looksLikeText(bytes: Uint8Array): boolean {
  if (!bytes.length) return false;
  // UTF-16 has NUL bytes in every ASCII character; its byte-order mark identifies it.
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) return true;
  const n = Math.min(bytes.length, 4096);
  let control = 0;
  for (let i = 0; i < n; i++) {
    const b = bytes[i] ?? 0;
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) control++;
  }
  return control / n < 0.02;
}
