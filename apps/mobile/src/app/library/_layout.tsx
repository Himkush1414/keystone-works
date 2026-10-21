import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import LamplightEngine from '../../../modules/lamplight-engine';
import { useT } from '@/i18n/useLocale';
import { MiniPlayer } from '@/player/MiniPlayer';
import { useServices } from '@/services/context';

/** The library stack, with the mini player floating above every library screen. */
export default function LibraryLayout() {
  const { toast } = useServices();
  const t = useT();
  const actions = useMemo(() => {
    const failed = () => toast.getState().show({ message: t('errors.voiceUnavailable'), tone: 'danger' });
    return {
      onPlay: () => void LamplightEngine.play().catch(failed),
      onPause: () => void LamplightEngine.pause().catch(failed),
    };
  }, [toast, t]);
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
      <MiniPlayer {...actions} />
    </View>
  );
}
