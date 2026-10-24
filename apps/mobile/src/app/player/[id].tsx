import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { useStore } from 'zustand';
import LamplightEngine from '../../../modules/lamplight-engine';
import { listCharacters, loadContent } from '@/data/content';
import { getItem } from '@/data/library';
import { rulesFor } from '@/data/userdata';
import { useT } from '@/i18n/useLocale';
import { PlayerScreen, type PlayerActions } from '@/player/PlayerScreen';
import {
  changeCharacterVoice,
  changeCleanRead,
  changeQuality,
  changeVoice,
  cleanReadRows,
  cleanSettingsFor,
  mergeCharactersAndRequeue,
} from '@/player/session';
import { useServices } from '@/services/context';
import { playDocument, queueCache } from '@/services/device';
import { failureOf } from '@/player/failure';
import { lookUpWord } from '@/player/meaning';
import { relocateSentence } from '@/player/relocate';
import { DEFAULT_NARRATOR } from '@lamplight/core';

/** The meaning is short and wanted now: a quick render is plenty. */
const MEANING_STEPS = 4;

export default function PlayerRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const services = useServices();
  const t = useT();
  const speakUrls = useStore(services.settings, (s) => s.speakUrls);
  const loadedDoc = useStore(services.player, (s) => s.queue?.docId ?? null);
  // A long PDF's whole book replaces its first pages while it plays: read it again when that happens.
  const revision = useStore(services.library, (s) => (id ? (s.revisions[id] ?? 0) : 0));

  // `revision` is a dependency on purpose: the stored document changed.
  const item = useMemo(() => (id ? getItem(services.db, id) : undefined), [services.db, id, revision]);
  const content = useMemo(() => (item ? loadContent(services.db, item.id) : null), [services.db, item]);
  const dictionary = useMemo(() => (item ? rulesFor(services.db, item.id) : []), [services.db, item]);
  const clean = useMemo(
    () => (item && content ? cleanSettingsFor(item, content, speakUrls) : null),
    [item, content, speakUrls],
  );

  const actions = useMemo<PlayerActions>(() => {
    // Every failure is shown with its reason (PlayerScreen's banner), never swallowed.
    const failed = (e: unknown) =>
      services.player.getState().setFailure(failureOf(e, t('errors.voiceUnavailable')));
    const run = (p: Promise<unknown>) => void p.catch(failed);
    return {
      // The native player may not hold this book (its load failed, or another book took over): load it first.
      play: () =>
        id &&
        run(
          services.player.getState().native.docId === id
            ? LamplightEngine.play()
            : playDocument(services, id, { autoplay: true }),
        ),
      lookUpWord: (word, context) => lookUpWord(LamplightEngine, word, context),
      speak: (text, lang) => {
        const voice =
          (item?.language.slice(0, 2) === lang ? item.settings.voice : undefined) ??
          services.settings.getState().voices[lang] ??
          DEFAULT_NARRATOR;
        run(LamplightEngine.previewVoice(text, lang, voice, MEANING_STEPS));
      },
      pause: () => run(LamplightEngine.pause()),
      skip: (delta) => run(LamplightEngine.skip(delta)),
      seekTo: (index) => run(LamplightEngine.seekTo(index)),
      playFrom: (index) =>
        id &&
        run(
          services.player.getState().native.docId === id
            ? LamplightEngine.playFrom(index)
            : playDocument(services, id, { autoplay: true, at: index }),
        ),
      setSpeed: (speed) => run(LamplightEngine.setSpeed(speed)),
      setSleepTimer: (minutes, endOfChapter) => run(LamplightEngine.setSleepTimer(minutes, endOfChapter)),
      setVoice: (voice) =>
        id &&
        run(
          changeVoice(
            { db: services.db, store: services.player, engine: LamplightEngine, ...queueCache },
            id,
            voice,
            services.settings.getState(),
            services.player.getState().progress.index,
          ),
        ),
      setQuality: (quality) =>
        id && run(changeQuality({ db: services.db, engine: LamplightEngine }, id, quality)),
      listCharacters: () => (id ? listCharacters(services.db, id) : []),
      setCharacterVoice: (characterId, voice) =>
        id &&
        run(
          changeCharacterVoice(
            { db: services.db, store: services.player, engine: LamplightEngine, ...queueCache },
            id,
            characterId,
            voice,
            services.settings.getState(),
            services.player.getState().progress.index,
          ),
        ),
      mergeCharacters: (from, into) =>
        id &&
        run(
          mergeCharactersAndRequeue(
            { db: services.db, store: services.player, engine: LamplightEngine, ...queueCache },
            id,
            from,
            into,
            services.settings.getState(),
            services.player.getState().progress.index,
          ),
        ),
      // Read the document fresh: its Clean Read settings change as the listener toggles them.
      cleanReadRows: () => {
        const current = id ? getItem(services.db, id) : undefined;
        return current && content
          ? cleanReadRows(current, content, services.settings.getState().speakUrls)
          : [];
      },
      setCleanRead: (reason, on) =>
        id &&
        run(
          changeCleanRead(
            { db: services.db, store: services.player, engine: LamplightEngine, ...queueCache },
            id,
            reason,
            on,
            services.settings.getState(),
            services.player.getState().progress.index,
          ),
        ),
      close: () => (router.canGoBack() ? router.back() : router.replace('/library')),
      openDiagnostics: () => router.push('/settings/diagnostics'),
    };
  }, [services, t, id, content, item]);

  // Opening a document that isn't the one in the player starts it.
  useEffect(() => {
    if (!item || item.status !== 'ready' || loadedDoc === item.id) return;
    playDocument(services, item.id).catch((e: unknown) =>
      services.player.getState().setFailure(failureOf(e, t('errors.voiceUnavailable'))),
    );
  }, [item, loadedDoc, services, t]);

  // The whole book arrived: carry on from the same sentence in it (its number may have changed).
  const shown = useRef(content);
  useEffect(() => {
    const before = shown.current;
    shown.current = content;
    if (!before || !content || before === content || !item) return;
    const player = services.player.getState();
    if (player.native.docId !== item.id) return;
    const at = relocateSentence(before, content, player.progress.index);
    playDocument(services, item.id, { at, autoplay: player.native.playing }).catch((e: unknown) =>
      services.player.getState().setFailure(failureOf(e, t('errors.voiceUnavailable'))),
    );
  }, [content, item, services, t]);

  // Unpack the dictionary while the listener settles in, so the first question is answered at once.
  useEffect(() => {
    void LamplightEngine.warmDictionary().catch(() => undefined);
  }, []);

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
