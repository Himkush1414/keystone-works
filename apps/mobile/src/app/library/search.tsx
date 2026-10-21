import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { sentenceAtBlock } from '@/data/content';
import { search, type SearchHit } from '@/data/library';
import { getSetting, setSetting } from '@/data/userdata';
import { useT } from '@/i18n/useLocale';
import { rememberSearch } from '@/library/search';
import { SearchScreen } from '@/library/SearchScreen';
import { useServices } from '@/services/context';
import { playDocument } from '@/services/device';

const RECENT_KEY = 'recentSearches';

export default function SearchRoute() {
  const services = useServices();
  const { db } = services;
  const t = useT();
  const [recent, setRecent] = useState<string[]>(() => getSetting<string[]>(db, RECENT_KEY, []));
  const save = useCallback(
    (next: string[]) => {
      setRecent(next);
      setSetting(db, RECENT_KEY, next);
    },
    [db],
  );
  const run = useCallback((q: string) => search(db, q), [db]);

  // An in-text result opens the player at that sentence, paused, with the sentence lit (feature spec).
  const openText = useCallback(
    (hit: SearchHit) => {
      const at = hit.blockOrd === undefined ? undefined : sentenceAtBlock(db, hit.documentId, hit.blockOrd);
      playDocument(services, hit.documentId, { autoplay: false, ...(at === undefined ? {} : { at }) })
        .then(() => router.push(`/player/${hit.documentId}`))
        .catch(() =>
          services.toast.getState().show({ message: t('errors.voiceUnavailable'), tone: 'danger' }),
        );
    },
    [db, services, t],
  );

  return (
    <SearchScreen
      search={run}
      recent={recent}
      onRemember={(q) => save(rememberSearch(recent, q))}
      onClearRecent={() => save([])}
      onOpenTitle={(hit) => router.push(`/player/${hit.documentId}`)}
      onOpenText={openText}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/library'))}
    />
  );
}
