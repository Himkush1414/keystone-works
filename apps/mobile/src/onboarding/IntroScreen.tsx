import { estimateWordTimes, normalize, wordAt, type WordTime } from '@lamplight/core';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { TKey } from '@/i18n/translate';
import { useLocale, useT } from '@/i18n/useLocale';
import { FONT } from '@/theme/fonts';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { IconButton } from '@/ui/IconButton';
import { Screen, useGutter } from '@/ui/Screen';
import { Text } from '@/ui/Text';

const PAGES: { title: TKey; body: TKey; sample?: TKey }[] = [
  { title: 'intro.title1', body: 'intro.body1', sample: 'intro.sample1' },
  { title: 'intro.title2', body: 'intro.body2' },
  { title: 'intro.title3', body: 'intro.body3' },
];

export interface IntroProps {
  /** Speaks `text`; resolves with its length in ms, or null when the voice can't start. */
  speak(text: string, lang: string): Promise<number | null>;
  stop(): void;
  onDone(): void;
}

/**
 * The first-run introduction (feature spec F1.4): three pages, each read aloud by the app itself, with the
 * sample line lit word by word as it's spoken. Audio stops on every page change; the voice can be muted.
 */
export function IntroScreen({ speak, stop, onDone }: IntroProps) {
  const t = useT();
  const locale = useLocale();
  const { colors, space, reduceMotion } = useTheme();
  const gutter = useGutter();
  const [page, setPage] = useState(0);
  const [muted, setMuted] = useState(false);
  const [voiceFailed, setVoiceFailed] = useState(false);
  const [words, setWords] = useState<{ times: WordTime[]; startedAt: number } | null>(null);
  const [now, setNow] = useState(0);
  const current = PAGES[page] ?? PAGES[0];
  const sample = current?.sample ? t(current.sample) : null;
  const spoken = current ? [t(current.title), sample ?? t(current.body)].join(' ') : '';
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    setWords(null);
    if (muted) return;
    speak(spoken, locale)
      .then((ms) => {
        if (gen !== generation.current) return;
        if (ms === null) return setVoiceFailed(true);
        if (!sample) return;
        // Light the sample's words across the part of the audio that speaks them (after the title).
        const titleShare = (spoken.length - sample.length) / spoken.length;
        const times = estimateWordTimes(
          normalize(sample, { start: 0, end: sample.length }, locale),
          sample,
          ms * (1 - titleShare),
        );
        setWords({ times, startedAt: performance.now() + ms * titleShare });
      })
      .catch(() => gen === generation.current && setVoiceFailed(true));
    return () => {
      generation.current++;
      stop();
    };
  }, [page, muted, spoken, sample, locale, speak, stop]);

  useEffect(() => {
    if (!words) return;
    const id = setInterval(() => setNow(performance.now()), 80);
    return () => clearInterval(id);
  }, [words]);

  const word = words ? words.times[wordAt(words.times, now - words.startedAt)] : undefined;
  const last = page === PAGES.length - 1;
  const next = () => (last ? onDone() : setPage(page + 1));

  return (
    <Screen bottom>
      <View style={[styles.top, { paddingHorizontal: space.xs }]}>
        <View style={styles.flex} />
        <IconButton
          icon="headphones"
          color={muted ? colors.inkFaint : colors.accent}
          label={t(muted ? 'intro.unmute' : 'intro.mute')}
          selected={!muted}
          onPress={() => setMuted(!muted)}
        />
      </View>
      <Animated.View
        key={page}
        entering={FadeIn.duration(reduceMotion ? 160 : 320)}
        style={[styles.page, { paddingHorizontal: gutter, gap: space.lg }]}
      >
        {page === 1 ? <Icon name="airplane" size={40} color={colors.accent} /> : null}
        <Text variant="display" accessibilityRole="header">
          {t(current?.title ?? 'intro.title1')}
        </Text>
        <Text variant="body" tone="soft">
          {t(current?.body ?? 'intro.body1')}
        </Text>
        {sample ? (
          <RNText style={[styles.sample, { color: colors.ink, fontFamily: FONT.reader }]}>
            {word ? sample.slice(0, word.start) : sample}
            {word ? (
              <RNText
                style={{
                  backgroundColor: colors.glow,
                  textDecorationLine: 'underline',
                  textDecorationColor: colors.underline,
                }}
              >
                {sample.slice(word.start, word.end)}
              </RNText>
            ) : null}
            {word ? sample.slice(word.end) : null}
          </RNText>
        ) : null}
        {voiceFailed ? (
          <Text variant="meta" tone="danger">
            {t('errors.voiceUnavailable')}
          </Text>
        ) : null}
      </Animated.View>
      <View style={[styles.bottom, { paddingHorizontal: gutter, paddingBottom: space.lg, gap: space.md }]}>
        <View
          style={styles.dots}
          accessible
          accessibilityRole="text"
          accessibilityLabel={t('intro.page', { page: page + 1, total: PAGES.length })}
        >
          {PAGES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === page ? colors.accent : colors.hairline, width: i === page ? 18 : 6 },
              ]}
            />
          ))}
        </View>
        <View style={styles.row}>
          {last ? <View /> : <Button label={t('common.skip')} kind="quiet" onPress={onDone} />}
          <Button label={t('common.continue')} onPress={next} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', minHeight: 56, alignItems: 'center' },
  page: { flex: 1, justifyContent: 'center', maxWidth: 560, width: '100%', alignSelf: 'center' },
  sample: { fontSize: 20, lineHeight: 32 },
  bottom: {},
  dots: { flexDirection: 'row', gap: 6, alignSelf: 'center', paddingVertical: 8 },
  dot: { height: 6, borderRadius: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
