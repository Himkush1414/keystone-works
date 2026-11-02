import { router } from 'expo-router';
import LamplightEngine from '../../../modules/lamplight-engine';
import { SettingsScreen } from '@/settings/SettingsScreen';

const storage = {
  cacheBytes: () => LamplightEngine.cacheBytes(),
  clearCache: () => LamplightEngine.clearCache(),
};

export default function SettingsRoute() {
  return (
    <SettingsScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/library'))}
      onPronunciation={() => router.push('/settings/pronunciation')}
      onDiagnostics={() => router.push('/settings/diagnostics')}
      storage={storage}
    />
  );
}
