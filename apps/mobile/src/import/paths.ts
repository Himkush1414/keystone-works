/** "file:///data/user/0/app/cache/My%20Book.pdf" → "/data/user/0/app/cache/My Book.pdf" (native code opens paths). */
export function uriToPath(uri: string): string {
  const path = uri.replace(/^file:\/\//, '');
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

const COVER_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

/** File extension for a cover image's MIME type; unknown types are stored as .img and sniffed when shown. */
export function coverExtension(mime: string): string {
  return COVER_EXTENSIONS[mime.toLowerCase()] ?? 'img';
}

/**
 * MIME types offered in the system file picker. Android labels Markdown and many shared files as
 * octet-stream, so that is included; detectFormat checks the bytes either way.
 */
export const PICKER_TYPES = [
  'application/epub+zip',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/html',
  'application/xhtml+xml',
  'application/octet-stream',
];
