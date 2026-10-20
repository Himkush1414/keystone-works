import { strFromU8, unzipSync, type UnzipFileInfo } from 'fflate';
import { ImportError } from '../model';

export interface ZipLimits {
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
  maxRatio: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxEntries: 10_000,
  maxEntryBytes: 200 * 1024 * 1024,
  maxTotalBytes: 1024 * 1024 * 1024,
  maxRatio: 1000,
};

/** Normalises a zip-internal path; returns null for absolute or escaping paths. */
export function safePath(path: string): string | null {
  const parts: string[] = [];
  for (const seg of path.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (!parts.length) return null;
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  if (!parts.length || /^[a-z]:$/i.test(parts[0] ?? '')) return null;
  return parts.join('/');
}

/** Resolves `href` (URL-encoded, maybe with a fragment) relative to the directory of `base`. */
export function resolveHref(base: string, href: string): { path: string | null; fragment?: string } {
  const [rawPath = '', fragment] = href.split('#', 2);
  let decoded = rawPath;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    // keep as written
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) return { path: null }; // external URL
  const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
  const path = decoded === '' ? safePath(base) : safePath(dir + decoded);
  return fragment ? { path, fragment } : { path };
}

/**
 * Unzips in memory with zip-bomb protection. Entries are keyed by their normalised path; entries with unsafe
 * paths are dropped. Throws ImportError('corrupt' | 'tooLarge').
 */
export function readZip(bytes: Uint8Array, limits: ZipLimits = DEFAULT_ZIP_LIMITS): Map<string, Uint8Array> {
  let entries = 0;
  let total = 0;
  let violation: ImportError | null = null;
  const filter = (f: UnzipFileInfo) => {
    entries++;
    total += f.originalSize;
    if (
      entries > limits.maxEntries ||
      f.originalSize > limits.maxEntryBytes ||
      total > limits.maxTotalBytes
    ) {
      violation = new ImportError('tooLarge');
      return false;
    }
    if (f.size > 0 && f.originalSize / f.size > limits.maxRatio) {
      violation = new ImportError('tooLarge');
      return false;
    }
    return safePath(f.name) !== null && !f.name.endsWith('/');
  };
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(bytes, { filter });
  } catch {
    throw new ImportError('corrupt');
  }
  if (violation) throw violation;
  const out = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(raw)) {
    const p = safePath(name);
    if (p) out.set(p, data);
  }
  return out;
}

export const text = (data: Uint8Array | undefined): string => {
  if (!data) return '';
  const s = strFromU8(data);
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
};
