import { StyleSheet, View } from 'react-native';
import { useT } from '@/i18n/useLocale';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { OptionRow } from '@/ui/OptionRow';
import { Screen, useGutter } from '@/ui/Screen';
import { Text } from '@/ui/Text';

/** The last onboarding step (feature spec F1.6): what to hear first. */
export function StartScreen({
  onFile,
  onPaste,
  onSample,
  onSkip,
}: {
  onFile(): void;
  onPaste(): void;
  onSample(): void;
  onSkip(): void;
}) {
  const t = useT();
  const { space } = useTheme();
  const gutter = useGutter();
  return (
    <Screen bottom>
      <View style={[styles.body, { paddingHorizontal: gutter, gap: space.lg }]}>
        <Text variant="display" accessibilityRole="header">
          {t('start.title')}
        </Text>
        <View style={{ gap: space.xs }}>
          <OptionRow
            icon="sample"
            label={t('start.sample')}
            hint={t('start.sampleHint')}
            onPress={onSample}
          />
          <OptionRow icon="importFile" label={t('start.file')} hint={t('start.fileHint')} onPress={onFile} />
          <OptionRow icon="paste" label={t('start.paste')} hint={t('start.pasteHint')} onPress={onPaste} />
        </View>
      </View>
      <View style={{ paddingHorizontal: gutter, paddingBottom: space.lg, alignItems: 'flex-start' }}>
        <Button label={t('common.skip')} kind="quiet" onPress={onSkip} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', maxWidth: 560, width: '100%', alignSelf: 'center' },
});
