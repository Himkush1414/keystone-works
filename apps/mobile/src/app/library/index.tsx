import { router } from 'expo-router';
import LamplightEngine from '../../../modules/lamplight-engine';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { LibraryItem } from '@/data/library';
import { useT } from '@/i18n/useLocale';
import { ExportSheet } from '@/library/ExportSheet';
import { exportChoice, runExport, stopExport } from '@/library/exportActions';
import { ImportSheet } from '@/library/ImportSheet';
import { ItemSheet } from '@/library/ItemSheet';
import { LibraryScreen } from '@/library/LibraryScreen';
import { useImportActions } from '@/library/useImportActions';
import { useServices } from '@/services/context';
import { playDocument } from '@/services/device';

export default function LibraryRoute() {
  const services = useServices();
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<LibraryItem | null>(null);
  const failed = useCallback(
    (key: 'errors.generic' | 'errors.voiceUnavailable') =>
      services.toast.getState().show({ message: t(key), tone: 'danger' }),
    [services, t],
  );
  const play = useCallback(
    (item: LibraryItem) => {
      if (item.status !== 'ready') return;
      playDocument(services, item.id).catch(() => failed('errors.voiceUnavailable'));
    },
    [services, failed],
  );
  const { fromFile, fromSample, toCompose } = useImportActions();

  // Audio export (R-EX-1). The sheet can close while the engine works; a toast then says how it ended.
  const [exporting, setExporting] = useState<LibraryItem | null>(null);
  const exportOpen = useRef(false);
  exportOpen.current = exporting !== null;
  const choice = useMemo(() => (exporting ? exportChoice(services, exporting) : null), [services, exporting]);
  const openExport = useCallback(
    (item: LibraryItem) => {
      const state = services.exports.getState();
      // Reopening the book being exported shows its progress; anything else starts fresh.
      if (
        state.docId !== item.id &&
        (state.phase === 'done' || state.phase === 'failed' || state.phase === 'cancelled')
      )
        state.reset();
      setExporting(item);
    },
    [services],
  );
  const startExport = useCallback(
    (chapter?: number) => {
      if (!exporting) return;
      const item = exporting;
      void runExport(services, item, chapter, (phase) => {
        if (exportOpen.current || (phase !== 'done' && phase !== 'failed')) return;
        services.toast.getState().show({
          message: t(phase === 'done' ? 'export.finishedToast' : 'export.failedToast', { title: item.title }),
          ...(phase === 'failed' ? { tone: 'danger' as const } : {}),
          action: { label: t('export.show'), run: () => setExporting(item) },
        });
      });
    },
    [services, exporting, t],
  );
  const closeExport = useCallback(() => {
    const state = services.exports.getState();
    if (state.phase === 'done' || state.phase === 'failed' || state.phase === 'cancelled') state.reset();
    setExporting(null);
  }, [services]);

  // Deleting what the player holds stops it first; the toast's Undo puts the item back in the library.
  const remove = useCallback(
    (item: LibraryItem) => {
      if (services.player.getState().queue?.docId === item.id) {
        LamplightEngine.stop().catch(() => undefined);
        services.player.getState().setQueue(null);
      }
      const undo = services.library.getState().remove(item.id);
      services.toast.getState().show({
        message: t('item.deleted', { title: item.title }),
        action: { label: t('common.undo'), run: undo },
      });
    },
    [services, t],
  );

  const actions = useMemo(
    () => ({
      onAdd: () => setAdding(true),
      onMore: setSelected,
      onSearch: () => router.push('/library/search'),
      onSettings: () => router.push('/settings'),
      onOpen: (item: LibraryItem) => {
        if (item.status === 'ready') router.push(`/player/${item.id}`);
      },
      onPlay: play,
    }),
    [play],
  );
  return (
    <>
      <LibraryScreen {...actions} />
      <ImportSheet
        visible={adding}
        onClose={() => setAdding(false)}
        onFile={fromFile}
        onPaste={toCompose}
        onSample={fromSample}
      />
      <ItemSheet
        item={selected}
        onClose={() => setSelected(null)}
        onPlay={play}
        onToggleFinished={(item) =>
          services.library.getState().setFinished(item.id, item.finishedAt === null)
        }
        onSaveDetails={(item, details) => services.library.getState().editDetails(item.id, details)}
        onDelete={remove}
        onExport={openExport}
      />
      <ExportSheet
        visible={exporting !== null}
        title={exporting?.title ?? ''}
        choice={choice}
        exports={services.exports}
        onStart={startExport}
        onStop={stopExport}
        onClose={closeExport}
      />
    </>
  );
}
