import { router } from 'expo-router';
import { useCallback } from 'react';
import { getItem } from '@/data/library';
import { importBundledSample, pickAndImport } from '@/import/device';
import type { Sample } from '@/import/samples';
import { useT } from '@/i18n/useLocale';
import { useServices } from '@/services/context';
import { errorLog } from '@/services/errors';
import { isStorageFull } from '@/import/run';
import { playDocument, prepareQueueSoon } from '@/services/device';
import { importMessage } from './importMessage';

/** The ways into the library (file, paste, sample), with the toasts and player hand-off they share. */
export function useImportActions() {
  const services = useServices();
  const t = useT();
  // The picker's copy or the database can fail before an item exists: say a full phone is full, and keep
  // anything else in the error log (Settings › Diagnostics) instead of only a generic toast.
  const failed = useCallback(
    (e: unknown) => {
      const full = isStorageFull(e);
      if (!full) errorLog.record(e, 'js');
      services.toast
        .getState()
        .show({ message: t(full ? 'errors.storageFull' : 'errors.generic'), tone: 'danger' });
    },
    [services, t],
  );
  const voiceFailed = useCallback(
    () => services.toast.getState().show({ message: t('errors.voiceUnavailable'), tone: 'danger' }),
    [services, t],
  );
  const open = useCallback((id: string) => router.push(`/player/${id}`), []);

  const fromFile = useCallback(() => {
    services.library
      .getState()
      .runImport(() =>
        pickAndImport(services.db, {
          onUpdate: (id, replaced) => {
            services.library.getState().touch(id, replaced);
            // The whole of a long PDF has arrived: build its queue now, so opening it needs none.
            if (replaced) prepareQueueSoon(services, id);
          },
        }),
      )
      .then((summary) => {
        // A long PDF still being read gets its queue when the whole book is in (above).
        summary?.added
          .filter((id) => !getItem(services.db, id)?.loading)
          .forEach((id) => prepareQueueSoon(services, id));
        const message = summary
          ? importMessage(summary, t, (id) => {
              if (getItem(services.db, id)?.status === 'ready') playDocument(services, id).catch(voiceFailed);
            })
          : null;
        if (message) services.toast.getState().show(message);
      })
      .catch(failed);
  }, [services, t, failed, voiceFailed]);

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
        .catch(failed);
    },
    [services, t, open, failed],
  );

  const toCompose = useCallback(() => router.push('/import/compose'), []);

  return { fromFile, fromSample, toCompose };
}
