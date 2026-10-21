import { router } from 'expo-router';
import { useCallback } from 'react';
import { getItem } from '@/data/library';
import { importBundledSample, pickAndImport } from '@/import/device';
import type { Sample } from '@/import/samples';
import { useT } from '@/i18n/useLocale';
import { useServices } from '@/services/context';
import { playDocument } from '@/services/device';
import { importMessage } from './importMessage';

/** The ways into the library (file, paste, sample), with the toasts and player hand-off they share. */
export function useImportActions() {
  const services = useServices();
  const t = useT();
  const failed = useCallback(
    () => services.toast.getState().show({ message: t('errors.generic'), tone: 'danger' }),
    [services, t],
  );
  const open = useCallback((id: string) => router.push(`/player/${id}`), []);

  const fromFile = useCallback(() => {
    services.library
      .getState()
      .runImport(() => pickAndImport(services.db))
      .then((summary) => {
        const message = summary
          ? importMessage(summary, t, (id) => {
              if (getItem(services.db, id)) playDocument(services, id).catch(failed);
            })
          : null;
        if (message) services.toast.getState().show(message);
      })
      .catch(failed);
  }, [services, t, failed]);

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
