import { getLocales } from 'expo-localization';
import { useEffect } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { resolveLocale, translate } from '@/i18n/translate';
import { errorLog } from '@/services/errors';
import { ThemeProvider, useTheme } from '@/theme/theme';
import { Button } from './Button';
import { Screen } from './Screen';
import { Text } from './Text';

export interface ErrorScreenProps {
  error: Error;
  retry(): Promise<void>;
}

/**
 * Shown in place of the app when a screen throws while drawing (expo-router's ErrorBoundary). It sits outside
 * the app's providers, so it follows the phone's language and light/dark setting rather than the app's.
 */
export function ErrorScreen(props: ErrorScreenProps) {
  useEffect(() => errorLog.record(props.error, 'screen', true), [props.error]);
  return (
    <SafeAreaProvider>
      <ThemeProvider preference="system" motionPreference="system">
        <ErrorBody {...props} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function ErrorBody({ error, retry }: ErrorScreenProps) {
  const { space } = useTheme();
  const locale = resolveLocale(getLocales().map((l) => l.languageTag));
  const t = (key: 'crash.title' | 'crash.body' | 'crash.retry') => translate(locale, key);
  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.body, { padding: space.xl, gap: space.lg }]}>
        <Text variant="title1" accessibilityRole="header">
          {t('crash.title')}
        </Text>
        <Text>{t('crash.body')}</Text>
        <Text variant="meta" tone="soft" selectable>
          {error.message}
        </Text>
        <Button label={t('crash.retry')} onPress={() => void retry()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({ body: { flexGrow: 1, justifyContent: 'center' } });
