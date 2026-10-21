import { useCallback, useMemo } from 'react';
import type { LibraryItem } from '@/data/library';
import { pickAndImport } from '@/import/device';
import { LibraryScreen } from '@/library/LibraryScreen';
import { useServices } from '@/services/context';
import { playDocument } from '@/services/device';

// shortcut: import and playback errors only reach the developer console until the toast exists; failed
// imports still show in their row.
export default function LibraryRoute() {
  const services = useServices();
  const play = useCallback(
    (item: LibraryItem) => {
      if (item.status === 'ready')
        playDocument(services, item.id).catch((e: unknown) => console.warn('play failed', e));
    },
    [services],
  );
  const actions = useMemo(
    () => ({
      onAdd: () => {
        services.library
          .getState()
          .runImport(() => pickAndImport(services.db))
          .catch((e: unknown) => console.warn('import failed', e));
      },
      onOpen: play,
      onPlay: play,
    }),
    [services, play],
  );
  return <LibraryScreen {...actions} />;
}
