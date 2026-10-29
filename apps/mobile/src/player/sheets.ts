import type { Block, Sentence } from '@lamplight/core';
import type { PlayerState, QueueFile } from '../../modules/lamplight-engine/src/types';
import type { Bookmark } from '../data/userdata';
import { formatDuration, translate, type Locale } from '../i18n/translate';

/** Sleep timer choices in minutes (R-PL-6); "end of chapter" is offered separately. */
export const SLEEP_MINUTES = [5, 10, 15, 30, 45, 60] as const;

/** What the sleep timer is doing, for the button and the sheet; null when it's off. */
export function sleepStatus(
  state: Pick<PlayerState, 'sleepAt' | 'sleepAtIndex'>,
  now: number,
  locale: Locale,
): string | null {
  if (state.sleepAtIndex !== null) return translate(locale, 'sleep.endsAtChapter');
  if (state.sleepAt === null) return null;
  const left = state.sleepAt - now;
  if (left < 60_000) return translate(locale, 'sleep.endsSoon');
  return translate(locale, 'sleep.endsIn', { time: formatDuration(locale, left) });
}

export interface ContentsEntry {
  title: string;
  /** Sentence the chapter starts at. */
  start: number;
  current: boolean;
}

/** The chapter list: an untitled opening (front matter) takes the document's title. */
export function contentsEntries(
  queue: Pick<QueueFile, 'title' | 'chapterStarts' | 'chapterTitles'>,
  index: number,
): ContentsEntry[] {
  let current = 0;
  queue.chapterStarts.forEach((start, k) => {
    if (start <= index) current = k;
  });
  return queue.chapterStarts.map((start, k) => ({
    title: queue.chapterTitles[k]?.trim() || queue.title,
    start,
    current: k === current,
  }));
}

export interface BookmarkEntry {
  id: string;
  /** Sentence the bookmark marks. */
  start: number;
  /** Its label, or the start of its sentence. */
  text: string;
}

/** Longest sentence opening shown for a bookmark; the row clips it further. */
const BOOKMARK_CHARS = 90;

/** Bookmarks in reading order, each named by its label or the words it marks; ones past the end are dropped. */
export function bookmarkEntries(
  bookmarks: readonly Pick<Bookmark, 'id' | 'sentenceOrd' | 'label'>[],
  blocks: readonly Pick<Block, 'text'>[],
  sentences: readonly Pick<Sentence, 'block' | 'start' | 'end'>[],
): BookmarkEntry[] {
  return bookmarks
    .flatMap((b) => {
      const s = sentences[b.sentenceOrd];
      if (!s) return [];
      const words = (blocks[s.block]?.text ?? '').slice(s.start, s.end).replace(/\s+/g, ' ').trim();
      const text =
        b.label ?? (words.length > BOOKMARK_CHARS ? `${words.slice(0, BOOKMARK_CHARS).trimEnd()}…` : words);
      return [{ id: b.id, start: b.sentenceOrd, text }];
    })
    .sort((a, b) => a.start - b.start);
}
