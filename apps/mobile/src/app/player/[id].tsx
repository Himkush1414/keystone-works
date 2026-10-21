import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import LamplightEngine from '../../../modules/lamplight-engine';
import { loadContent } from '@/data/content';
import { getItem } from '@/data/library';
import { rulesFor } from '@/data/userdata';
import { useT } from '@/i18n/useLocale';
import { PlayerScreen, type PlayerActions } from '@/player/PlayerScreen';
import { cleanSettingsFor } from '@/player/session';
import { useServices } from '@/services/context';
import { playDocument } from '@/services/device';

export default function PlayerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const services = useServices();
  const t = useT();
  const speakUrls = useStore(services.settings, (s) => s.speakUrls);
  const loadedDoc = useStore(services.player, (s) => s.queue?.docId ?? null);

  const item = useMemo(() => (id ? getItem(services.db, id) : undefined), [services.db, id]);
  const content = useMemo(() => (item ? loadContent(services.db, item.id) : null), [services.db, item]);
  const dictionary = useMemo(() => (item ? rulesFor(services.db, item.id) : []), [services.db, item]);
  const clean = useMemo(
    () => (item && content ? cleanSettingsFor(item, content, speakUrls) : null),
    [item, content, speakUrls],
  );

  const actions = useMemo<PlayerActions>(() => {
    const failed = () =>
      services.toast.getState().show({ message: t('errors.voiceUnavailable'), tone: 'danger' });
    const run = (p: Promise<unknown>) => void p.catch(failed);
    return {
      play: () => run(LamplightEngine.play()),
      pause: () => run(LamplightEngine.pause()),
      skip: (delta) => run(LamplightEngine.skip(delta)),
      seekTo: (index) => run(LamplightEngine.seekTo(index)),
      setSpeed: (speed) => run(LamplightEngine.setSpeed(speed)),
      setSleepTimer: (minutes, endOfChapter) => run(LamplightEngine.setSleepTimer(minutes, endOfChapter)),
      close: () => (router.canGoBack() ? router.back() : router.replace('/library')),
    };
  }, [services, t]);

  // Opening a document that isn't the one in the player starts it.
  useEffect(() => {
    if (!item || item.status !== 'ready' || loadedDoc === item.id) return;
    playDocument(services, item.id).catch(() =>
      services.toast.getState().show({ message: t('errors.voiceUnavailable'), tone: 'danger' }),
    );
  }, [item, loadedDoc, services, t]);

  if (!item || !content || !clean) return null;
  return (
    <PlayerScreen
      item={item}
      content={content}
      clean={clean}
      customSkips={item.settings.customSkips ?? []}
      dictionary={dictionary}
      actions={actions}
    />
  );
}
