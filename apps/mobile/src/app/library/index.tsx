import { router } from 'expo-router';
import LamplightEngine from '../../../modules/lamplight-engine';
import { useCallback, useMemo, useState } from 'react';
import type { LibraryItem } from '@/data/library';
import { useT } from '@/i18n/useLocale';
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
      />
    </>
  );
}
