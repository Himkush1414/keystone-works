import type { Chapter, QueueSegment, Sentence } from '@lamplight/core';
import type { QueueFile } from '../../modules/lamplight-engine/src/types';

export interface QueueMeta {
  docId: string;
  title: string;
  author?: string | null;
  artworkUri?: string | null;
}

/**
 * Sentence index where each chapter starts, ascending and starting at 0. Chapters that contain no sentences
 * are dropped, so every entry points at a real sentence. Sentences before the first chapter (front matter, or
 * a document without chapters) form an untitled chapter at 0.
 */
export function chapterStarts(
  chapters: readonly Chapter[],
  sentences: readonly Sentence[],
): { starts: number[]; titles: string[] } {
  const starts: number[] = [];
  const titles: string[] = [];
  const blockAt = (i: number) => sentences[i]?.block ?? Infinity;
  let s = 0;
  chapters.forEach((chapter, c) => {
    const nextBlock = chapters[c + 1]?.blockStart ?? Infinity;
    while (blockAt(s) < chapter.blockStart) s++;
    if (blockAt(s) >= nextBlock) return;
    if (starts.at(-1) === s) return;
    starts.push(s);
    titles.push(chapter.title);
  });
  if (starts[0] !== 0) {
    starts.unshift(0);
    titles.unshift('');
  }
  return { starts, titles };
}

/**
 * Builds the queue file the native player reads (QueueSpec.parse in Queue.kt). The player looks segments up
 * by position, so the queue must cover every sentence from 0 in order.
 */
export function toQueueFile(
  meta: QueueMeta,
  chapters: readonly Chapter[],
  sentences: readonly Sentence[],
  segments: readonly QueueSegment[],
): QueueFile {
  segments.forEach((seg, k) => {
    if (seg.i !== k) throw new Error(`queue segment ${k} has index ${seg.i}; expected a contiguous queue`);
  });
  const { starts, titles } = chapterStarts(chapters, sentences);
  // Starts are ascending; drop chapters beyond a queue built for part of the document (always keep 0).
  const kept = Math.max(1, starts.filter((i) => i < segments.length).length);
  return {
    docId: meta.docId,
    title: meta.title,
    ...(meta.author ? { author: meta.author } : {}),
    ...(meta.artworkUri ? { artworkUri: meta.artworkUri } : {}),
    chapterStarts: starts.slice(0, kept),
    chapterTitles: titles.slice(0, kept),
    segments: segments.map(fileSegment),
  };
}

type FileSegment = QueueFile['segments'][number];

function fileSegment(s: QueueSegment): FileSegment {
  return {
    i: s.i,
    text: s.text,
    lang: s.lang,
    voice: s.voice,
    pauseMs: s.pauseMs,
    kind: s.kind,
    ...(s.rate !== undefined ? { rate: s.rate } : {}),
    ...(s.gainDb !== undefined ? { gainDb: s.gainDb } : {}),
    ...(s.pitch !== undefined ? { pitch: s.pitch } : {}),
    ...(s.ending ? { ending: s.ending } : {}),
    ...(s.breath ? { breath: true } : {}),
    ...(s.release ? { release: true } : {}),
    ...(s.runs ? { runs: s.runs.map((r) => ({ text: r.text, lang: r.lang })) } : {}),
  };
}

const placeholder = (i: number): FileSegment => ({
  i,
  text: '',
  lang: '',
  voice: '',
  pauseMs: 0,
  kind: 'pending',
  pending: true,
});

/**
 * A queue for `count` sentences of which only `segments` are built yet (a long book starts where the listener
 * is, and the rest is filled in while it plays). The app keeps every index, with placeholders for the rest.
 */
export function partialQueueFile(
  meta: QueueMeta,
  chapters: readonly Chapter[],
  sentences: readonly Sentence[],
  segments: readonly QueueSegment[],
  count: number,
): QueueFile {
  const { starts, titles } = chapterStarts(chapters, sentences);
  const dense = Array.from({ length: count }, (_, i) => placeholder(i));
  for (const s of segments) if (s.i >= 0 && s.i < count) dense[s.i] = fileSegment(s);
  return {
    docId: meta.docId,
    title: meta.title,
    ...(meta.author ? { author: meta.author } : {}),
    ...(meta.artworkUri ? { artworkUri: meta.artworkUri } : {}),
    count,
    chapterStarts: starts,
    chapterTitles: titles,
    segments: dense,
  };
}

/** The queue with `segments` built in (a copy; the store sees a new queue). */
export function withSegments(queue: QueueFile, segments: readonly QueueSegment[]): QueueFile {
  const next = queue.segments.slice();
  for (const s of segments) if (s.i >= 0 && s.i < next.length) next[s.i] = fileSegment(s);
  return { ...queue, segments: next };
}

/** True once every sentence is built. */
export const isComplete = (queue: QueueFile): boolean => queue.segments.every((s) => !s.pending);

/** What the native player reads: built segments only, plus how many sentences there are in all. */
export function forPlayer(queue: QueueFile, segments: readonly QueueSegment[] | null = null): string {
  const list = segments ? segments.map(fileSegment) : queue.segments.filter((s) => !s.pending);
  return JSON.stringify({ ...queue, count: queue.segments.length, segments: list });
}
