import { useState } from 'react';
import { View } from 'react-native';
import { SAMPLES, type Sample } from '@/import/samples';
import { useT } from '@/i18n/useLocale';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { OptionRow } from '@/ui/OptionRow';
import { Sheet } from '@/ui/Sheet';

export interface ImportSheetProps {
  visible: boolean;
  onClose(): void;
  onFile(): void;
  onPaste(): void;
  onSample(sample: Sample): void;
}

/** "Add to library": a file, pasted text, or one of the bundled samples (a second step lists them). */
export function ImportSheet({ visible, onClose, onFile, onPaste, onSample }: ImportSheetProps) {
  const t = useT();
  const { space } = useTheme();
  const [step, setStep] = useState<'choose' | 'samples'>('choose');
  const close = () => {
    setStep('choose');
    onClose();
  };
  const pick = (run: () => void) => () => {
    close();
    run();
  };
  return (
    <Sheet
      visible={visible}
      title={t(step === 'choose' ? 'import.title' : 'import.sample')}
      onClose={close}
      closeLabel={t('common.close')}
    >
      {step === 'choose' ? (
        <View>
          <OptionRow
            icon="importFile"
            label={t('start.file')}
            hint={t('start.fileHint')}
            onPress={pick(onFile)}
          />
          <OptionRow
            icon="paste"
            label={t('start.paste')}
            hint={t('start.pasteHint')}
            onPress={pick(onPaste)}
          />
          <OptionRow
            icon="sample"
            label={t('start.sample')}
            hint={t('start.sampleHint')}
            onPress={() => setStep('samples')}
          />
        </View>
      ) : (
        <View style={{ gap: space.xs }}>
          {SAMPLES.map((s) => (
            <OptionRow
              key={s.id}
              icon="sample"
              label={s.title}
              hint={s.author}
              onPress={pick(() => onSample(s))}
            />
          ))}
          <View style={{ alignSelf: 'flex-start' }}>
            <Button label={t('common.back')} kind="quiet" icon="back" onPress={() => setStep('choose')} />
          </View>
        </View>
      )}
    </Sheet>
  );
}
