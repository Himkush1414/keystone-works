import type { QueueFile } from '../../modules/lamplight-engine/src/types';

/** One audio file of an export: a chapter's sentences [from, to). */
export interface ExportTrack {
  /** 1-based position in the playlist. */
  n: number;
  title: string;
  /** File name in the chosen folder, e.g. "03 The Red-Headed League.m4a". */
  file: string;
  from: number;
  to: number;
}

export interface ExportPlan {
  /** Folder made inside the one the listener picks, named after the book. */
  folder: string;
  playlist: string;
  tracks: ExportTrack[];
  /** Sentences to render or read from the cache, for progress. */
  sentences: number;
}

/** Characters no common file system accepts, and control characters. */
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f<>:"/\\|?*]+/g;

/** A title as a file name: unsafe characters replaced, spaces collapsed, no trailing dots, at most 80 characters. */
export function safeName(title: string, fallback = 'Lamplight'): string {
  const cleaned = title.replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim();
  const cut = Array.from(cleaned).slice(0, 80).join('').trim();
  const name = cut.replace(/[.\s]+$/, '');
  return name || fallback;
}

/**
 * What exporting `queue` writes: one M4A per chapter (or only `chapter`), numbered so they sort in reading
 * order, and a playlist. Chapters with nothing to say (headings only, blank pages) are left out.
 */
export function exportPlan(queue: QueueFile, opts: { chapter?: number } = {}): ExportPlan {
  const count = queue.segments.length;
  const starts = queue.chapterStarts.length ? queue.chapterStarts : [0];
  const spoken = (from: number, to: number) =>
    queue.segments.slice(from, to).some((s) => s.text.trim().length > 0);
  const chapters = starts
    .map((from, c) => ({
      c,
      from,
      to: starts[c + 1] ?? count,
      title: queue.chapterTitles[c]?.trim() || queue.title,
    }))
    .filter((ch) => ch.to > ch.from && spoken(ch.from, ch.to))
    .filter((ch) => opts.chapter === undefined || ch.c === opts.chapter);
  const width = Math.max(2, String(chapters.length).length);
  const book = safeName(queue.title);
  const tracks = chapters.map((ch, k) => {
    const n = k + 1;
    return {
      n,
      title: ch.title,
      file: `${String(n).padStart(width, '0')} ${safeName(ch.title, book)}.m4a`,
      from: ch.from,
      to: ch.to,
    };
  });
  return {
    folder: book,
    playlist: `${book}.m3u8`,
    tracks,
    sentences: tracks.reduce((n, t) => n + t.to - t.from, 0),
  };
}

/** An extended M3U playlist (UTF-8) listing the tracks with their lengths, as players and cars read it. */
export function playlist(
  plan: ExportPlan,
  meta: { title: string; author?: string | null },
  durationsMs: readonly number[],
): string {
  const lines = ['#EXTM3U', `#PLAYLIST:${meta.title}`];
  plan.tracks.forEach((t, k) => {
    const seconds = Math.round((durationsMs[k] ?? 0) / 1000);
    lines.push(`#EXTINF:${seconds},${meta.author ? `${meta.author} - ` : ''}${t.title}`, t.file);
  });
  return lines.join('\n') + '\n';
}

/** Time left, from the pace so far; null until there's enough to go on. */
export function exportEta(done: number, total: number, elapsedMs: number): number | null {
  if (done < 3 || elapsedMs < 2_000 || done >= total) return done >= total ? 0 : null;
  return Math.round((elapsedMs / done) * (total - done));
}
