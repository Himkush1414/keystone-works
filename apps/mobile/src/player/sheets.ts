import type { PlayerState, QueueFile } from '../../modules/lamplight-engine/src/types';
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
