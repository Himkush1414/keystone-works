import { loadContent } from '../data/content';
import type { LibraryItem } from '../data/library';
import { chapterStarts } from '../player/queue';
import { cancelExport, exportDocument, ExportFailure } from '../services/device';
import type { Services } from '../services/services';
import { exportBusy, type ExportPhase } from '../state/export';
import type { ExportChoice } from './ExportSheet';

/** What the export sheet offers for `item`: the whole book, and the chapter being heard if it's in the player. */
export function exportChoice(s: Services, item: LibraryItem): ExportChoice {
  const content = loadContent(s.db, item.id);
  const { starts } = chapterStarts(content.chapters, content.sentences);
  const { queue, progress } = s.player.getState();
  if (queue?.docId !== item.id || queue.chapterStarts.length < 2) return { chapters: starts.length };
  let c = 0;
  while (c + 1 < queue.chapterStarts.length && (queue.chapterStarts[c + 1] ?? Infinity) <= progress.index)
    c++;
  return { chapters: starts.length, current: { index: c, title: queue.chapterTitles[c] || item.title } };
}

/**
 * Runs one export through the export store; `ended` hears how it finished (the library shows a toast when
 * the sheet was closed meanwhile). A second export while one runs is ignored.
 */
export async function runExport(
  s: Services,
  item: LibraryItem,
  chapter: number | undefined,
  ended: (phase: ExportPhase) => void,
): Promise<void> {
  const store = s.exports;
  if (exportBusy(store.getState())) return;
  store.getState().begin(item.id, item.title, Date.now());
  try {
    const outcome = await exportDocument(s, item.id, chapter === undefined ? {} : { chapter }, (e) =>
      store.getState().progress(e, Date.now()),
    );
    if (!outcome) {
      store.getState().reset();
      return;
    }
    store.getState().finish(outcome);
  } catch (e) {
    const code = e instanceof ExportFailure ? e.code : 'export-failed';
    if (code === 'export-cancelled') store.getState().cancelled();
    else {
      console.warn('audio export failed', e);
      store.getState().fail(code);
    }
  }
  ended(store.getState().phase);
}

export const stopExport = () => cancelExport().catch(() => undefined);
