import { router } from 'expo-router';
import LamplightEngine from '../../../modules/lamplight-engine';
import { errorLog } from '@/services/errors';
import { DiagnosticsScreen } from '@/settings/DiagnosticsScreen';

export default function DiagnosticsRoute() {
  return (
    <DiagnosticsScreen
      load={() => LamplightEngine.getDiagnostics()}
      test={() => LamplightEngine.runVoiceTest()}
      ab={(kind, lang) => LamplightEngine.abSample(kind, lang)}
      errors={errorLog.list}
      clearErrors={errorLog.clear}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
    />
  );
}
