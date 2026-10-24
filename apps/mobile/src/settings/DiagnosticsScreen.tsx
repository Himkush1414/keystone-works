import { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, View } from 'react-native';
import type { Diagnostics, VoiceTest } from '../../modules/lamplight-engine/src/types';
import { useLocale, useT } from '@/i18n/useLocale';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { Screen, useGutter } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { diagnosticsReport, diagnosticsSections, isSilenced } from './diagnostics';
import { Section } from './SettingsScreen';

export interface DiagnosticsProps {
  load(): Promise<Diagnostics>;
  test(): Promise<VoiceTest>;
  onBack(): void;
}

const MONO = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });

/** Settings › Advanced › Diagnostics: what the voice engine is doing, and a report to send when it fails. */
export function DiagnosticsScreen({ load, test, onBack }: DiagnosticsProps) {
  const t = useT();
  const locale = useLocale();
  const { colors, space } = useTheme();
  const gutter = useGutter();
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<VoiceTest | null>(null);

  const refresh = useCallback(() => {
    load()
      .then((d) => {
        setData(d);
        setLoadError(null);
      })
      .catch((e: unknown) => setLoadError(String((e as Error | null)?.message ?? e)));
  }, [load]);
  useEffect(refresh, [refresh]);

  const runTest = () => {
    setTesting(true);
    test()
      .then(setResult)
      .catch((e: unknown) =>
        setResult({ ok: false, error: { code: 'unknown', message: String(e), detail: '', at: Date.now() } }),
      )
      .finally(() => {
        setTesting(false);
        refresh();
      });
  };

  const engine = data && typeof data.engine !== 'string' ? data.engine : null;
  const ms = (n: number | undefined) => `${(n ?? 0).toLocaleString(locale)} ms`;

  return (
    <Screen>
      <View style={[styles.bar, { paddingHorizontal: space.xs }]}>
        <IconButton icon="back" label={t('common.back')} onPress={onBack} />
        <Text variant="title1" accessibilityRole="header">
          {t('diagnostics.title')}
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: space.x5, gap: space.xl }}
      >
        <Text variant="callout" tone="soft">
          {t('diagnostics.desc')}
        </Text>
        {loadError ? <Text tone="danger">{loadError}</Text> : null}
        {engine?.error ? (
          <Text variant="bodyStrong" tone="danger" accessibilityRole="alert">
            {engine.error.message}
          </Text>
        ) : null}
        {data && isSilenced(data) ? (
          <Text variant="bodyStrong" tone="danger">
            {t('diagnostics.volumeMuted')}
          </Text>
        ) : null}
        <View style={[styles.actions, { gap: space.sm }]}>
          <Button label={t('diagnostics.test')} icon="play" onPress={runTest} loading={testing} />
          <Button label={t('diagnostics.refresh')} kind="secondary" onPress={refresh} />
          <Button
            label={t('diagnostics.share')}
            icon="share"
            kind="secondary"
            disabled={!data}
            onPress={() => data && void Share.share({ message: diagnosticsReport(data, new Date()) })}
          />
        </View>
        {result ? (
          <Text tone={result.ok ? 'success' : 'danger'}>
            {result.ok
              ? t('diagnostics.testOk', { audio: ms(result.audioMs), render: ms(result.renderMs) })
              : t('diagnostics.testFailed', { reason: result.error?.message ?? '' })}
          </Text>
        ) : null}
        {data
          ? diagnosticsSections(data).map((section) => (
              <Section key={section.key} title={t(`diagnostics.${section.key}`)}>
                {section.rows.map(([label, value]) => (
                  <View key={label} style={[styles.row, { gap: space.sm }]}>
                    <Text variant="meta" tone="soft" style={styles.label}>
                      {label}
                    </Text>
                    <Text
                      variant="meta"
                      selectable
                      style={[styles.value, { fontFamily: MONO, color: colors.ink }]}
                    >
                      {value}
                    </Text>
                  </View>
                ))}
              </Section>
            ))
          : null}
        {data ? (
          <Section title={t('diagnostics.log')}>
            <Text variant="meta" selectable style={{ fontFamily: MONO, color: colors.ink }}>
              {data.log.length ? data.log.join('\n') : '—'}
            </Text>
          </Section>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 64, gap: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  label: { width: 120 },
  value: { flex: 1 },
});
