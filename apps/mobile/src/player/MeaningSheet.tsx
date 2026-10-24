import { answer, type AnswerLanguage, type Meaning } from '@lamplight/core';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Text as RNText, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useT } from '@/i18n/useLocale';
import { useTheme } from '@/theme/theme';
import { textStyle } from '@/ui/Text';
import { Button } from '@/ui/Button';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { sentenceTokens } from './meaning';

type Lookup = { state: 'idle' } | { state: 'loading' } | { state: 'done'; meaning: Meaning | null };

/**
 * "What does this word mean here?": the paused sentence with every word tappable, and a short meaning of
 * the chosen one in this context, in English or Hindi, which the narrator can say aloud.
 */
export function MeaningSheet({
  visible,
  sentence,
  context,
  initialLanguage,
  onClose,
  onResume,
  lookUp,
  speak,
}: {
  visible: boolean;
  /** The sentence as written. */
  sentence: string;
  /** Its paragraph, which tells the senses of a word apart. */
  context: string;
  initialLanguage: AnswerLanguage;
  onClose(): void;
  onResume(): void;
  lookUp(word: string, context: string): Promise<Meaning | null>;
  speak(text: string, lang: AnswerLanguage): void;
}) {
  const t = useT();
  const { colors, space, radius } = useTheme();
  const [word, setWord] = useState<number | null>(null);
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  const [lang, setLang] = useState<AnswerLanguage>(initialLanguage);
  const asked = useRef(0);
  const tokens = useMemo(() => sentenceTokens(sentence), [sentence]);

  // A new sentence starts with nothing chosen.
  useEffect(() => {
    setWord(null);
    setLookup({ state: 'idle' });
  }, [sentence]);
  useEffect(() => setLang(initialLanguage), [initialLanguage]);

  const choose = (k: number) => {
    const token = tokens[k];
    if (!token?.word) return;
    if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => undefined);
    setWord(k);
    setLookup({ state: 'loading' });
    const ticket = ++asked.current;
    lookUp(token.text, context)
      .then((meaning) => ticket === asked.current && setLookup({ state: 'done', meaning }))
      .catch(() => ticket === asked.current && setLookup({ state: 'done', meaning: null }));
  };

  const meaning = lookup.state === 'done' ? lookup.meaning : null;
  const reply = meaning ? answer(meaning, lang) : null;
  const reading = textStyle('body');

  return (
    <Sheet visible={visible} title={t('meaning.title')} onClose={onClose} closeLabel={t('common.close')}>
      <Text variant="meta" style={{ color: colors.inkSoft }}>
        {t('meaning.hint')}
      </Text>
      <RNText
        style={[reading, { color: colors.ink, lineHeight: Math.round((reading.fontSize ?? 17) * 1.6) }]}
      >
        {tokens.map((token, k) =>
          token.word ? (
            <RNText
              key={k}
              onPress={() => choose(k)}
              accessibilityRole="button"
              accessibilityState={{ selected: word === k }}
              accessibilityHint={t('meaning.wordHint')}
              suppressHighlighting
              style={
                word === k
                  ? {
                      backgroundColor: colors.glow,
                      color: colors.accent,
                      fontFamily: textStyle('bodyStrong').fontFamily,
                    }
                  : undefined
              }
            >
              {token.text}
            </RNText>
          ) : (
            <RNText key={k}>{token.text}</RNText>
          ),
        )}
      </RNText>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surfaceSunk, borderRadius: radius.md, padding: space.md, gap: space.xs },
        ]}
        accessibilityLiveRegion="polite"
      >
        {lookup.state === 'idle' && (
          <Text variant="callout" style={{ color: colors.inkSoft }}>
            {t('meaning.empty')}
          </Text>
        )}
        {lookup.state === 'loading' && (
          <View style={[styles.row, { gap: space.sm }]}>
            <ActivityIndicator color={colors.accent} />
            <Text variant="callout" style={{ color: colors.inkSoft }}>
              {t('meaning.looking')}
            </Text>
          </View>
        )}
        {lookup.state === 'done' && !meaning && (
          <Text variant="callout" style={{ color: colors.inkSoft }}>
            {t('meaning.notFound', { word: word !== null ? (tokens[word]?.text ?? '') : '' })}
          </Text>
        )}
        {meaning && reply && (
          <Animated.View entering={FadeIn.duration(140)} style={{ gap: space.xs }}>
            <Text variant="bodyStrong" style={{ color: colors.ink }}>
              {meaning.lemma}
              {meaning.roman ? ` · ${meaning.roman}` : ''}
              {meaning.pos ? (
                <Text variant="meta" style={{ color: colors.inkSoft }}>{`  ${meaning.pos}`}</Text>
              ) : null}
            </Text>
            <Text variant="body" style={{ color: colors.ink }}>
              {reply.headline}
            </Text>
            {reply.detail ? (
              <Text variant="callout" style={{ color: colors.inkSoft }}>
                {reply.detail}
              </Text>
            ) : null}
            {meaning.example ? (
              <Text variant="meta" style={{ color: colors.inkSoft, fontStyle: 'italic' }}>
                “{meaning.example}”
              </Text>
            ) : null}
            {lang === 'hi' && meaning.hindi.length === 0 ? (
              <Text variant="micro" style={{ color: colors.inkFaint }}>
                {t('meaning.noHindi')}
              </Text>
            ) : null}
          </Animated.View>
        )}
      </View>

      <Segmented<AnswerLanguage>
        value={lang}
        onChange={setLang}
        label={t('meaning.language')}
        options={[
          { value: 'en', label: 'English' },
          { value: 'hi', label: 'हिन्दी' },
        ]}
      />
      <View style={[styles.row, { gap: space.sm }]}>
        <View style={styles.grow}>
          <Button
            label={t('meaning.hear')}
            icon="voice"
            kind="secondary"
            block
            disabled={!reply}
            onPress={() => reply && speak(reply.speak.text, reply.speak.lang)}
          />
        </View>
        <View style={styles.grow}>
          <Button label={t('meaning.resume')} icon="play" block onPress={onResume} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 76, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
});
