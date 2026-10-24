import { router } from 'expo-router';
import LamplightEngine from '../../../modules/lamplight-engine';
import { DiagnosticsScreen } from '@/settings/DiagnosticsScreen';

export default function DiagnosticsRoute() {
  return (
    <DiagnosticsScreen
      load={() => LamplightEngine.getDiagnostics()}
      test={() => LamplightEngine.runVoiceTest()}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
    />
  );
}
