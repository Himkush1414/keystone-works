import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import type { SearchHit } from '@/data/library';
import { useT } from '@/i18n/useLocale';
import { FONT } from '@/theme/fonts';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Cover } from '@/ui/Cover';
import { Icon } from '@/ui/Icon';
import { IconButton } from '@/ui/IconButton';
import { Screen, useGutter } from '@/ui/Screen';
import { Tappable } from '@/ui/Tappable';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { snippetParts } from './search';

export interface SearchScreenProps {
  search(query: string): { titles: SearchHit[]; body: SearchHit[] };
  recent: readonly string[];
  onRemember(query: string): void;
  onClearRecent(): void;
  onOpenTitle(hit: SearchHit): void;
  onOpenText(hit: SearchHit): void;
  onBack(): void;
}

/** Search the library (R-LB-4): titles and authors first, then the text itself, with the match lit. */
export function SearchScreen(props: SearchScreenProps) {
  const t = useT();
  const { space } = useTheme();
  const gutter = useGutter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ titles: SearchHit[]; body: SearchHit[] } | null>(null);
  const { search } = props;

  // Debounced so typing stays smooth on a large library (feature spec: 120 ms).
  useEffect(() => {
    if (!query.trim()) return setResults(null);
    const id = setTimeout(() => setResults(search(query)), 120);
    return () => clearTimeout(id);
  }, [query, search]);

  const open = (hit: SearchHit, run: (h: SearchHit) => void) => () => {
    props.onRemember(query);
    run(hit);
  };
  const nothing = results && !results.titles.length && !results.body.length;

  return (
    <Screen>
      <View style={[styles.bar, { paddingHorizontal: space.xs, gap: space.xs }]}>
        <IconButton icon="back" label={t('common.back')} onPress={props.onBack} />
        <TextField
          value={query}
          onChangeText={setQuery}
          label={t('library.search')}
          placeholder={t('search.placeholder')}
          autoFocus
          returnKeyType="search"
          autoCorrect={false}
          style={styles.field}
        />
        <View style={{ width: gutter - space.xs }} />
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: space.x4, gap: space.lg }}
      >
        {!results ? (
          props.recent.length ? (
            <View style={{ gap: space.xs }}>
              <View style={styles.sectionHead}>
                <Text variant="micro" tone="soft">
                  {t('search.recent')}
                </Text>
                <Button label={t('search.clearRecent')} kind="quiet" onPress={props.onClearRecent} />
              </View>
              {props.recent.map((q) => (
                <Tappable
                  key={q}
                  onPress={() => setQuery(q)}
                  accessibilityRole="button"
                  style={[styles.recent, { gap: space.md }]}
                >
                  <Icon name="search" size={18} />
                  <Text variant="body">{q}</Text>
                </Tappable>
              ))}
            </View>
          ) : null
        ) : nothing ? (
          <Text variant="body" tone="soft" align="center" style={{ marginTop: space.x4 }}>
            {t('empty.search', { query: query.trim() })}
          </Text>
        ) : (
          <>
            {results.titles.length ? (
              <View style={{ gap: space.xs }}>
                <Text variant="micro" tone="soft" accessibilityRole="header">
                  {t('search.titles')}
                </Text>
                {results.titles.map((hit) => (
                  <Tappable
                    key={hit.documentId}
                    onPress={open(hit, props.onOpenTitle)}
                    accessibilityRole="button"
                    accessibilityLabel={[hit.title, hit.author].filter(Boolean).join(', ')}
                    style={[styles.title, { gap: space.md }]}
                  >
                    <Cover title={hit.title} author={hit.author} width={36} />
                    <View style={styles.flex}>
                      <Text variant="bodyStrong" numberOfLines={2}>
                        {hit.title}
                      </Text>
                      {hit.author ? (
                        <Text variant="meta" tone="soft" numberOfLines={1}>
                          {hit.author}
                        </Text>
                      ) : null}
                    </View>
                  </Tappable>
                ))}
              </View>
            ) : null}
            {results.body.length ? (
              <View style={{ gap: space.sm }}>
                <Text variant="micro" tone="soft" accessibilityRole="header">
                  {t('search.inText')}
                </Text>
                {results.body.map((hit) => (
                  <Tappable
                    key={`${hit.documentId}:${hit.blockOrd}`}
                    onPress={open(hit, props.onOpenText)}
                    accessibilityRole="button"
                    style={{ gap: 2, paddingVertical: space.xs }}
                  >
                    <Text variant="meta" tone="soft" numberOfLines={1}>
                      {hit.title}
                    </Text>
                    <Snippet text={hit.snippet ?? ''} />
                  </Tappable>
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Snippet({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <RNText
      numberOfLines={2}
      style={{ fontFamily: FONT.reader, fontSize: 16, lineHeight: 24, color: colors.ink }}
    >
      {snippetParts(text).map((p, i) =>
        p.match ? (
          <RNText key={i} style={{ fontFamily: FONT.readerBold, backgroundColor: colors.glow }}>
            {p.text}
          </RNText>
        ) : (
          p.text
        ),
      )}
    </RNText>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 64 },
  field: { flex: 1 },
  flex: { flex: 1 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recent: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  title: { flexDirection: 'row', alignItems: 'center', minHeight: 64 },
});
