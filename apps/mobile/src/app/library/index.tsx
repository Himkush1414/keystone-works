import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import type { LibraryItem } from '@/data/library';
import { getItem } from '@/data/library';
import { importBundledSample, pickAndImport } from '@/import/device';
import type { Sample } from '@/import/samples';
import { useT } from '@/i18n/useLocale';
import { ImportSheet } from '@/library/ImportSheet';
import { importMessage } from '@/library/importMessage';
import { LibraryScreen } from '@/library/LibraryScreen';
import { useServices } from '@/services/context';
import { playDocument } from '@/services/device';

export default function LibraryRoute() {
  const services = useServices();
  const t = useT();
  const [adding, setAdding] = useState(false);
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
  const open = useCallback((id: string) => router.push(`/player/${id}`), []);

  const fromFile = useCallback(() => {
    services.library
      .getState()
      .runImport(() => pickAndImport(services.db))
      .then((summary) => {
        const message = summary
          ? importMessage(summary, t, (id) => {
              const item = getItem(services.db, id);
              if (item) play(item);
            })
          : null;
        if (message) services.toast.getState().show(message);
      })
      .catch(() => failed('errors.generic'));
  }, [services, t, play, failed]);

  // A sample lands in the player already speaking (R-ON-4); a second time opens the copy already there.
  const fromSample = useCallback(
    (sample: Sample) => {
      services.library
        .getState()
        .runImport(async () => [await importBundledSample(services.db, sample)])
        .then((summary) => {
          const id = summary?.added[0] ?? summary?.duplicates[0];
          if (id) open(id);
          else if (summary) {
            const message = importMessage(summary, t, open);
            if (message) services.toast.getState().show(message);
          }
        })
        .catch(() => failed('errors.generic'));
    },
    [services, t, open, failed],
  );

  const actions = useMemo(
    () => ({
      onAdd: () => setAdding(true),
      onOpen: (item: LibraryItem) => {
        if (item.status === 'ready') open(item.id);
      },
      onPlay: play,
    }),
    [play, open],
  );
  return (
    <>
      <LibraryScreen {...actions} />
      <ImportSheet
        visible={adding}
        onClose={() => setAdding(false)}
        onFile={fromFile}
        onPaste={() => router.push('/import/compose')}
        onSample={fromSample}
      />
    </>
  );
}
