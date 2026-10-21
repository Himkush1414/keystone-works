import { router } from 'expo-router';
import { useCallback } from 'react';
import { SAMPLES } from '@/import/samples';
import { useImportActions } from '@/library/useImportActions';
import { StartScreen } from '@/onboarding/StartScreen';
import { useServices } from '@/services/context';

export default function Start() {
  const { settings } = useServices();
  const { fromFile, fromSample, toCompose } = useImportActions();
  // Whatever the listener picks, onboarding is done and the library becomes home.
  const finish = useCallback(
    (then?: () => void) => () => {
      settings.getState().update({ onboarded: true });
      router.replace('/library');
      then?.();
    },
    [settings],
  );
  const sample = SAMPLES[0];
  return (
    <StartScreen
      onFile={finish(fromFile)}
      onPaste={finish(toCompose)}
      onSample={finish(sample ? () => fromSample(sample) : undefined)}
      onSkip={finish()}
    />
  );
}
