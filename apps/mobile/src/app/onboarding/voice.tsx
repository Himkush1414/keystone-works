import { router } from 'expo-router';
import { useCallback } from 'react';
import LamplightEngine from '../../../modules/lamplight-engine';
import { useLocale } from '@/i18n/useLocale';
import { VoicePickScreen } from '@/onboarding/VoicePickScreen';
import { useServices } from '@/services/context';

const PREVIEW_STEPS = 8; // below 6 steps the voice breaks (ReadAhead.FLOOR_STEPS)

export default function VoicePick() {
  const { settings } = useServices();
  const locale = useLocale();
  const preview = useCallback(
    (text: string, lang: string, voice: string) =>
      void LamplightEngine.previewVoice(text, lang, voice, PREVIEW_STEPS).catch(() => undefined),
    [],
  );
  const stop = useCallback(() => void LamplightEngine.stopPreview().catch(() => undefined), []);
  const choose = useCallback(
    (voice: string) => {
      const { voices, update } = settings.getState();
      update({ voices: { ...voices, [locale]: voice } });
      router.push('/onboarding/start');
    },
    [settings, locale],
  );
  return <VoicePickScreen preview={preview} stop={stop} onChoose={choose} />;
}
