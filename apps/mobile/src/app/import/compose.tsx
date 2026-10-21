import { getStringAsync } from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { importPasted } from '@/import/device';
import { useT } from '@/i18n/useLocale';
import { importMessage } from '@/library/importMessage';
import { useServices } from '@/services/context';
import { FONT } from '@/theme/fonts';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { Screen, useGutter } from '@/ui/Screen';
import { Text } from '@/ui/Text';

/** Paste or type text to hear it: one calm field, filled from the clipboard when there's something there. */
export default function Compose() {
  const services = useServices();
  const t = useT();
  const { colors, space, radius } = useTheme();
  const gutter = useGutter();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getStringAsync()
      .then((clip) => setText((current) => current || clip))
      .catch(() => undefined);
  }, []);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/library'));
  const add = async () => {
    setBusy(true);
    try {
      const summary = await services.library
        .getState()
        .runImport(async () => [await importPasted(services.db, { text, title })]);
      const added = summary?.added[0] ?? summary?.duplicates[0];
      if (added) router.replace(`/player/${added}`);
      else if (summary) {
        const message = importMessage(summary, t, () => undefined);
        if (message) services.toast.getState().show(message);
      }
    } catch {
      services.toast.getState().show({ message: t('errors.generic'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  // The border keeps each field's edge at 3:1 or more against the page (R-AX-2), which the sunk fill alone
  // doesn't reach on the dark theme.
  const field = {
    backgroundColor: colors.surfaceSunk,
    borderWidth: 1,
    borderColor: colors.inkFaint,
    borderRadius: radius.sm,
    color: colors.ink,
    fontFamily: FONT.ui,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  };
  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.bar, { paddingHorizontal: space.xs }]}>
          <IconButton icon="close" label={t('common.close')} onPress={close} />
          <Text variant="title2" accessibilityRole="header" style={styles.flex}>
            {t('import.composeTitle')}
          </Text>
          <View style={{ paddingRight: gutter - space.xs }}>
            <Button label={t('library.add')} onPress={add} loading={busy} disabled={!text.trim()} />
          </View>
        </View>
        <ScrollView
          contentContainerStyle={{ padding: gutter, gap: space.md }}
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t('import.composeName')}
            placeholderTextColor={colors.inkFaint}
            accessibilityLabel={t('import.composeName')}
            style={[field, { fontSize: 16, minHeight: 48 }]}
          />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('import.composePlaceholder')}
            placeholderTextColor={colors.inkFaint}
            accessibilityLabel={t('import.composePlaceholder')}
            multiline
            textAlignVertical="top"
            style={[field, { fontFamily: FONT.reader, fontSize: 17, lineHeight: 26, minHeight: 240 }]}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 4 },
});
