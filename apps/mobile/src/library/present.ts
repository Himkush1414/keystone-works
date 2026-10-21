import { fnv1a } from '@lamplight/engine-web';
import { coverPalettes } from '@lamplight/tokens';
import type { LibraryItem } from '../data/library';
import { formatDuration, translate, type Locale } from '../i18n/translate';

export interface GeneratedCover {
  background: string;
  ink: string;
  rule: string;
}

/** A typographic cover for items without artwork; the same title always gets the same cover (R-LB-5). */
export function generatedCover(title: string): GeneratedCover {
  const palette = coverPalettes[fnv1a(title.trim().toLowerCase()) % coverPalettes.length] ?? coverPalettes[0];
  const [background, ink, rule] = palette ?? ['#2F3A33', '#EFE6D2', '#C9A35B'];
  return { background, ink, rule };
}

/** Widest-case advance of Fraunces SemiBold, in ems (measured on screen); keeps a word from breaking. */
const DISPLAY_EM = 0.7;

/**
 * Title size for a cover whose text area is `inner` dp wide: about a sixth of the width, smaller for long
 * titles, and never so large that the longest word has to break.
 */
export function coverTitleSize(title: string, inner: number): number {
  const words = title.trim().split(/\s+/);
  const longest = Math.max(1, ...words.map((w) => [...w].length));
  const length = title.trim().length;
  const preferred = inner * (length > 48 ? 0.13 : length > 24 ? 0.16 : 0.2);
  return Math.max(6, Math.floor(Math.min(preferred, inner / (longest * DISPLAY_EM))));
}

/** The letter shown on small covers: the first letter of the title, skipping a leading article. */
export function monogram(title: string): string {
  const t = title.trim().replace(/^(the|a|an|der|die|das|el|la|los|las|le|les|o|os|as|un|une)\s+/i, '');
  return ([...t].find((ch) => /[\p{L}\p{N}]/u.test(ch)) ?? '·').toLocaleUpperCase();
}

/**
 * Listening time for a whole item from its word count, at the measured pace of the bundled voices
 * (about 15 characters, or 2.7 words, a second at 1×).
 *
 * shortcut: word-count estimate; switch to the sum of queue durations once items store it.
 */
export function estimatedListeningMs(wordCount: number, speed = 1): number {
  return Math.round(((wordCount / 2.7) * 1000) / (speed > 0 ? speed : 1));
}

export type ItemState = 'importing' | 'failed' | 'new' | 'inProgress' | 'finished';

export function itemState(item: LibraryItem): ItemState {
  if (item.status === 'importing') return 'importing';
  if (item.status === 'failed') return 'failed';
  if (item.finishedAt !== null) return 'finished';
  return item.progress > 0 ? 'inProgress' : 'new';
}

/** The meta line under a library row: author (unless the cover already shows it), then where the listener stands. */
export function rowMeta(item: LibraryItem, locale: Locale, speed = 1, withAuthor = true): string {
  const state = itemState(item);
  const status =
    state === 'importing'
      ? translate(locale, 'library.importing')
      : state === 'failed'
        ? translate(locale, 'library.failed')
        : state === 'finished'
          ? translate(locale, 'library.finished')
          : state === 'new'
            ? translate(locale, 'library.new')
            : translate(locale, 'library.timeLeft', {
                time: formatDuration(
                  locale,
                  estimatedListeningMs(item.wordCount, speed) * (1 - item.progress),
                ),
              });
  return [withAuthor ? item.author : null, status].filter(Boolean).join(' · ');
}
