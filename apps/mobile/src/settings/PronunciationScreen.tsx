import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { DictionaryEntry } from '@/data/userdata';
import { useT } from '@/i18n/useLocale';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { Screen, useGutter } from '@/ui/Screen';
import { SwitchRow } from '@/ui/SettingRows';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';

export interface NewEntry {
  match: string;
  sayAs: string;
  wholeWord: boolean;
  caseSensitive: boolean;
}

export interface PronunciationProps {
  entries: readonly DictionaryEntry[];
  onAdd(entry: NewEntry): void;
  onRemove(entry: DictionaryEntry): void;
  onTest(sayAs: string): void;
  onBack(): void;
}

/** The pronunciation dictionary (R-PR-1): how Lamplight should say names and terms, everywhere. */
export function PronunciationScreen({ entries, onAdd, onRemove, onTest, onBack }: PronunciationProps) {
  const t = useT();
  const { colors, space, radius } = useTheme();
  const gutter = useGutter();
  const [match, setMatch] = useState('');
  const [sayAs, setSayAs] = useState('');
  const [wholeWord, setWholeWord] = useState(true);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const ready = match.trim() !== '' && sayAs.trim() !== '';
  const add = () => {
    onAdd({ match, sayAs, wholeWord, caseSensitive });
    setMatch('');
    setSayAs('');
  };

  return (
    <Screen>
      <View style={[styles.bar, { paddingHorizontal: space.xs }]}>
        <IconButton icon="back" label={t('common.back')} onPress={onBack} />
        <Text variant="title1" accessibilityRole="header">
          {t('pronunciation.title')}
        </Text>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: space.x5, gap: space.lg }}
      >
        <Text variant="body" tone="soft">
          {t('pronunciation.desc')}
        </Text>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.hairline,
              borderRadius: radius.md,
              padding: space.md,
              gap: space.sm,
            },
          ]}
        >
          <Text variant="micro" tone="soft" accessibilityRole="header">
            {t('pronunciation.add')}
          </Text>
          <TextField
            value={match}
            onChangeText={setMatch}
            label={t('pronunciation.written')}
            placeholder={t('pronunciation.written')}
            autoCorrect={false}
          />
          <TextField
            value={sayAs}
            onChangeText={setSayAs}
            label={t('pronunciation.sayAs')}
            placeholder={t('pronunciation.sayAs')}
            autoCorrect={false}
          />
          <SwitchRow label={t('pronunciation.wholeWord')} value={wholeWord} onChange={setWholeWord} />
          <SwitchRow
            label={t('pronunciation.caseSensitive')}
            value={caseSensitive}
            onChange={setCaseSensitive}
          />
          <View style={styles.actions}>
            <Button
              label={t('pronunciation.test')}
              kind="secondary"
              icon="play"
              disabled={!sayAs.trim()}
              onPress={() => onTest(sayAs)}
            />
            <Button label={t('library.add')} icon="add" disabled={!ready} onPress={add} />
          </View>
        </View>
        {entries.length === 0 ? (
          <Text variant="callout" tone="soft" align="center">
            {t('pronunciation.empty')}
          </Text>
        ) : (
          <View style={{ gap: space.xs }}>
            {entries.map((e) => (
              <View key={e.id} style={[styles.entry, { gap: space.sm, borderBottomColor: colors.hairline }]}>
                <View style={styles.flex}>
                  <Text variant="bodyStrong">{e.match}</Text>
                  <Text variant="callout" tone="soft">
                    {`→ ${e.sayAs}${e.documentId ? ` · ${t('pronunciation.scopeDocument')}` : ''}`}
                  </Text>
                </View>
                <IconButton
                  icon="play"
                  label={`${t('pronunciation.test')}: ${e.match}`}
                  onPress={() => onTest(e.sayAs)}
                />
                <IconButton
                  icon="trash"
                  label={`${t('common.delete')}: ${e.match}`}
                  onPress={() => onRemove(e)}
                  color={colors.danger}
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 64, gap: 4 },
  card: { borderWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  flex: { flex: 1 },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
