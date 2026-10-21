import { DEFAULT_NARRATOR } from '@lamplight/core';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { useStore } from 'zustand';
import LamplightEngine from '../../../modules/lamplight-engine';
import { IntroScreen } from '@/onboarding/IntroScreen';
import { useServices } from '@/services/context';

/** Live quality for the intro: it has to start speaking within a moment of the page appearing. */
const INTRO_STEPS = 4;

export default function Intro() {
  const { settings } = useServices();
  const voices = useStore(settings, (s) => s.voices);
  const speak = useCallback(
    (text: string, lang: string) =>
      LamplightEngine.previewVoice(text, lang, voices[lang] ?? DEFAULT_NARRATOR, INTRO_STEPS).catch(
        () => null,
      ),
    [voices],
  );
  const stop = useCallback(() => void LamplightEngine.stopPreview().catch(() => undefined), []);
  return <IntroScreen speak={speak} stop={stop} onDone={() => router.push('/onboarding/voice')} />;
}
