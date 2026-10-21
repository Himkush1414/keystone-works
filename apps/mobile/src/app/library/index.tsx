import { useCallback, useMemo } from 'react';
import type { LibraryItem } from '@/data/library';
import { getItem } from '@/data/library';
import { pickAndImport } from '@/import/device';
import { useT } from '@/i18n/useLocale';
import { importMessage } from '@/library/importMessage';
import { LibraryScreen } from '@/library/LibraryScreen';
import { useServices } from '@/services/context';
import { playDocument } from '@/services/device';

export default function LibraryRoute() {
  const services = useServices();
  const t = useT();
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
  const actions = useMemo(
    () => ({
      onAdd: () => {
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
      },
      onOpen: play,
      onPlay: play,
    }),
    [services, play, failed, t],
  );
  return <LibraryScreen {...actions} />;
}
