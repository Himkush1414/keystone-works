import { DEFAULT_NARRATOR } from '@lamplight/core';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import LamplightEngine from '../../../modules/lamplight-engine';
import {
  addDictionaryEntry,
  listDictionary,
  removeDictionaryEntry,
  type DictionaryEntry,
} from '@/data/userdata';
import { useLocale, useT } from '@/i18n/useLocale';
import { useServices } from '@/services/context';
import { PronunciationScreen, type NewEntry } from '@/settings/PronunciationScreen';

export default function PronunciationRoute() {
  const services = useServices();
  const { db } = services;
  const t = useT();
  const locale = useLocale();
  const [entries, setEntries] = useState(() => listDictionary(db));
  const refresh = useCallback(() => setEntries(listDictionary(db)), [db]);

  const add = useCallback(
    (e: NewEntry | DictionaryEntry) => {
      addDictionaryEntry(db, e);
      refresh();
    },
    [db, refresh],
  );
  const remove = useCallback(
    (e: DictionaryEntry) => {
      removeDictionaryEntry(db, e.id);
      refresh();
      services.toast.getState().show({
        message: t('item.deleted', { title: e.match }),
        action: { label: t('common.undo'), run: () => add(e) },
      });
    },
    [db, refresh, services, t, add],
  );
  const test = useCallback(
    (sayAs: string) => {
      const voice = services.settings.getState().voices[locale] ?? DEFAULT_NARRATOR;
      LamplightEngine.previewVoice(sayAs, locale, voice, 8).catch(() =>
        services.toast.getState().show({ message: t('errors.voiceUnavailable'), tone: 'danger' }),
      );
    },
    [services, locale, t],
  );

  return (
    <PronunciationScreen
      entries={entries}
      onAdd={add}
      onRemove={remove}
      onTest={test}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
    />
  );
}
