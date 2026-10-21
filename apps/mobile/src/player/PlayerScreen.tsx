import { wordAt, type CleanSettings, type DictionaryRule } from '@lamplight/core';
import { readerThemes } from '@lamplight/tokens';
import { useEffect, useMemo, useState } from 'react';
import { ContentsSheet, SleepSheet } from './PlayerSheets';
import { sleepStatus } from './sheets';
import { StyleSheet, View } from 'react-native';
import { useStore } from 'zustand';
import type { DocumentContent } from '@/data/content';
import type { LibraryItem } from '@/data/library';
import { formatDuration } from '@/i18n/translate';
import { useLocale, useT } from '@/i18n/useLocale';
import { useServices } from '@/services/context';
import { useTheme } from '@/theme/theme';
import { IconButton } from '@/ui/IconButton';
import { ProgressBar } from '@/ui/ProgressBar';
import { Screen } from '@/ui/Screen';
import { Tappable } from '@/ui/Tappable';
import { Text } from '@/ui/Text';
import { ReadAlong } from './ReadAlongView';
import { blockOfSentence, readAlongBlocks, wordTimesFor } from './readAlong';
import { formatSpeed, nextSpeed } from './speed';
import { livePosition } from './store';

export interface PlayerActions {
  play(): void;
  pause(): void;
  skip(delta: number): void;
  seekTo(index: number): void;
  setSpeed(speed: number): void;
  setSleepTimer(minutes: number | null, endOfChapter: boolean): void;
  close(): void;
}

export interface PlayerScreenProps {
  item: LibraryItem;
  content: DocumentContent;
  clean: CleanSettings;
  customSkips: readonly string[];
  dictionary: readonly DictionaryRule[];
  actions: PlayerActions;
}

/** Ticks while playing so the word underline moves between the engine's 10 Hz progress events. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** The full player: the text lit as it is read, where you are, and the controls. */
export function PlayerScreen({ item, content, clean, customSkips, dictionary, actions }: PlayerScreenProps) {
  const { player, settings } = useServices();
  const mirror = useStore(player);
  const reader = useStore(settings);
  const { name, space } = useTheme();
  const locale = useLocale();
  const t = useT();

  const [sheet, setSheet] = useState<'sleep' | 'contents' | null>(null);
  const playing = mirror.native.playing;
  const now = useNow(playing);
  const { index, positionMs } = livePosition(mirror, now);
  const speed = mirror.native.speed;

  const blocks = useMemo(
    () => readAlongBlocks(content.blocks, content.sentences, clean, customSkips),
    [content, clean, customSkips],
  );
  const sentence = content.sentences[index];
  const currentBlock = sentence ? blockOfSentence(content.sentences, index) : -1;
  const speechMs = mirror.timeline?.speechMs(index) ?? 0;
  const times = useMemo(() => {
    const block = sentence ? content.blocks[sentence.block] : undefined;
    if (!block || !sentence || speechMs <= 0) return [];
    return wordTimesFor(block, sentence, item.language, speechMs, { clean, customSkips, dictionary });
    // timelineVersion: a measured length replaces the estimate
  }, [sentence, content, item.language, speechMs, clean, customSkips, dictionary, mirror.timelineVersion]);
  const w = times[wordAt(times, positionMs)];

  const theme =
    reader.readerTheme === 'auto'
      ? name === 'dark'
        ? readerThemes.night
        : readerThemes.paper
      : readerThemes[reader.readerTheme];
  const chapterIndex = mirror.timeline?.chapterOf(index) ?? 0;
  const chapterTitle = mirror.queue?.chapterTitles[chapterIndex] || item.title;
  const left = mirror.timeline?.remaining(index, positionMs, speed).chapterMs ?? 0;
  const progress = mirror.timeline?.progress(index, positionMs) ?? item.progress;
  const sleep = sleepStatus(mirror.native, Date.now(), locale);

  return (
    <Screen background={theme.bg}>
      <View style={[styles.bar, { paddingHorizontal: space.xs }]}>
        <IconButton icon="chevronDown" label={t('player.collapse')} onPress={actions.close} />
        <View style={styles.titles}>
          <Text variant="bodyStrong" numberOfLines={1} align="center" style={{ color: theme.ink }}>
            {item.title}
          </Text>
          <Text variant="meta" numberOfLines={1} align="center" style={{ color: theme.inkSoft }}>
            {chapterTitle !== item.title ? chapterTitle : (item.author ?? '')}
          </Text>
        </View>
        <IconButton icon="chapters" label={t('player.contents')} onPress={() => setSheet('contents')} />
      </View>

      <ReadAlong
        blocks={blocks}
        current={index}
        currentBlock={currentBlock}
        word={w ? { start: w.start, end: w.end } : null}
        theme={theme}
        font={reader.readerFont}
        size={reader.readerSize}
        lineHeight={reader.readerLineHeight}
        showSkipped={reader.showSkipped}
        onSentencePress={actions.seekTo}
        backToVoiceLabel={t('player.backToVoice')}
      />

      <View
        style={[
          styles.controls,
          { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg, gap: space.sm },
        ]}
      >
        <View style={{ gap: space.xs }}>
          <ProgressBar
            value={progress}
            label={t('a11y.progressValue', { percent: Math.round(progress * 100) })}
          />
          <Text variant="meta" align="right" numeric style={{ color: theme.inkSoft }}>
            {t('player.remaining', { time: formatDuration(locale, left) })}
          </Text>
        </View>
        <View style={styles.row}>
          <Tappable
            onPress={() => actions.setSpeed(nextSpeed(speed))}
            accessibilityRole="button"
            accessibilityLabel={`${t('player.speed')}: ${t('a11y.speedValue', { speed: formatSpeed(locale, speed) })}`}
            style={styles.speed}
          >
            <Text variant="bodyStrong" numeric style={{ color: theme.ink }}>
              {formatSpeed(locale, speed)}
            </Text>
          </Tappable>
          <IconButton
            icon="skipBack"
            label={t('player.prevSentence')}
            onPress={() => actions.skip(-1)}
            color={theme.ink}
          />
          <IconButton
            icon={playing ? 'pause' : 'play'}
            label={t(playing ? 'player.pause' : 'player.play')}
            onPress={playing ? actions.pause : actions.play}
            filled
            size={28}
          />
          <IconButton
            icon="skipForward"
            label={t('player.nextSentence')}
            onPress={() => actions.skip(1)}
            color={theme.ink}
          />
          <View style={styles.speed}>
            <IconButton
              icon="sleep"
              label={sleep ? `${t('player.sleep')}: ${sleep}` : t('player.sleep')}
              onPress={() => setSheet('sleep')}
              color={sleep ? theme.underline : theme.ink}
              selected={sleep !== null}
            />
          </View>
        </View>
      </View>
      <SleepSheet
        visible={sheet === 'sleep'}
        status={sleep}
        onClose={() => setSheet(null)}
        onSet={actions.setSleepTimer}
      />
      <ContentsSheet
        visible={sheet === 'contents'}
        queue={mirror.queue}
        index={index}
        onClose={() => setSheet(null)}
        onJump={actions.seekTo}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 56 },
  titles: { flex: 1 },
  controls: {},
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  speed: { minWidth: 56, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
});
