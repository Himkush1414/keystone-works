import { router } from 'expo-router';
import { SettingsScreen } from '@/settings/SettingsScreen';

export default function SettingsRoute() {
  return (
    <SettingsScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/library'))}
      onPronunciation={() => router.push('/settings/pronunciation')}
    />
  );
}
