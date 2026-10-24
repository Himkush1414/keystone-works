import {
  DEFAULT_NARRATOR,
  wordAt,
  type AnswerLanguage,
  type CleanSettings,
  type DictionaryRule,
  type Meaning,
} from '@lamplight/core';
import type { Quality } from '../../modules/lamplight-engine/src/types';
import { readerThemes } from '@lamplight/tokens';
import { useEffect, useMemo, useState } from 'react';
import { CastSheet, CleanReadSheet, ContentsSheet, SleepSheet, VoiceSheet } from './PlayerSheets';
import { MeaningSheet } from './MeaningSheet';
import type { CleanReadRow } from './session';
import { sleepStatus } from './sheets';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useStore } from 'zustand';
import type { CastCharacter, DocumentContent } from '@/data/content';
import type { LibraryItem } from '@/data/library';
import { formatDuration } from '@/i18n/translate';
import { useLocale, useT } from '@/i18n/useLocale';
import { useServices } from '@/services/context';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
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
  setVoice(voice: string): void;
  setQuality(quality: Quality): void;
  listCharacters(): CastCharacter[];
  setCharacterVoice(characterId: string, voice: string | null): void;
  mergeCharacters(from: string, into: string): void;
  cleanReadRows(): CleanReadRow[];
  setCleanRead(reason: CleanReadRow['reason'], on: boolean): void;
  /** What a word means in its paragraph, from the on-device dictionary. */
  lookUpWord(word: string, context: string): Promise<Meaning | null>;
  /** Says a short text in the narrator's voice (the meaning, while paused). */
  speak(text: string, lang: AnswerLanguage): void;
  /** A tapped sentence: narration moves there and plays from it, paused or not. */
  playFrom(index: number): void;
  close(): void;
  /** Settings › Diagnostics, from the failure banner. */
  openDiagnostics(): void;
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
  const { name, space, colors } = useTheme();
  const { width } = useWindowDimensions();
  const locale = useLocale();
  const t = useT();

  const [sheet, setSheet] = useState<'sleep' | 'contents' | 'voice' | 'cast' | 'clean' | 'meaning' | null>(
    null,
  );
  // The sentence the listener is asking about (narration pauses while they do).
  const [asking, setAsking] = useState<number | null>(null);
  const [cleanRows, setCleanRows] = useState<CleanReadRow[]>([]);
  const [characters, setCharacters] = useState<CastCharacter[]>([]);
  // This document's own choices, shown in the voice sheet and updated as the listener changes them.
  const [voice, setVoice] = useState(
    () => item.settings.voice ?? settings.getState().voices[item.language] ?? DEFAULT_NARRATOR,
  );
  const [quality, setQuality] = useState<Quality>(() => item.settings.quality ?? settings.getState().quality);
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

  const ask = (at: number) => {
    setAsking(at);
    if (playing) actions.pause();
    setSheet('meaning');
  };
  const asked = asking !== null ? content.sentences[asking] : undefined;
  const askedBlock = asked ? content.blocks[asked.block] : undefined;

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
        <IconButton
          icon="cleanRead"
          label={t('clean.title')}
          onPress={() => {
            setCleanRows(actions.cleanReadRows());
            setSheet('clean');
          }}
          color={theme.ink}
        />
        <IconButton
          icon="voice"
          label={t('player.voice')}
          onPress={() => setSheet('voice')}
          color={theme.ink}
        />
        <IconButton
          icon="chapters"
          label={t('player.contents')}
          onPress={() => setSheet('contents')}
          color={theme.ink}
        />
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
        onSentencePress={actions.playFrom}
        onSentenceLongPress={ask}
        backToVoiceLabel={t('player.backToVoice')}
      />

      <View
        style={[
          styles.controls,
          { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg, gap: space.sm },
        ]}
      >
        {mirror.failure ? (
          <View
            accessibilityRole="alert"
            style={[styles.failure, { borderColor: colors.danger, padding: space.sm, gap: space.sm }]}
          >
            <Text variant="callout" style={{ color: theme.ink, flex: 1 }}>
              {mirror.failure.message}
            </Text>
            <Button label={t('diagnostics.details')} kind="quiet" onPress={actions.openDiagnostics} />
          </View>
        ) : null}
        <View style={{ gap: space.xs }}>
          <ProgressBar
            value={progress}
            label={t('a11y.progressValue', { percent: Math.round(progress * 100) })}
          />
          <View style={styles.row}>
            <Tappable
              onPress={() => ask(index)}
              accessibilityRole="button"
              accessibilityLabel={t('meaning.ask')}
              hitSlop={12}
              style={[styles.chip, { gap: space.xs }]}
            >
              <Icon name="dictionary" size={16} color={theme.inkSoft} />
              {/* On the narrowest phones the icon alone leaves the time left room for one line. */}
              {width >= 360 ? (
                <Text variant="meta" style={{ color: theme.inkSoft }}>
                  {t('meaning.short')}
                </Text>
              ) : null}
            </Tappable>
            <Text
              variant="meta"
              align="right"
              numeric
              numberOfLines={1}
              style={{ color: theme.inkSoft, flexShrink: 1, marginLeft: space.md }}
            >
              {t('player.remaining', { time: formatDuration(locale, left) })}
            </Text>
          </View>
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
      <VoiceSheet
        visible={sheet === 'voice'}
        voice={voice}
        quality={quality}
        onClose={() => setSheet(null)}
        onVoice={(v) => {
          setVoice(v);
          actions.setVoice(v);
        }}
        onQuality={(q) => {
          setQuality(q);
          actions.setQuality(q);
        }}
        onCast={() => {
          setCharacters(actions.listCharacters());
          setSheet('cast');
        }}
      />
      <CleanReadSheet
        visible={sheet === 'clean'}
        rows={cleanRows}
        onClose={() => setSheet(null)}
        onToggle={(reason, on) => {
          actions.setCleanRead(reason, on);
          setCleanRows(actions.cleanReadRows());
        }}
      />
      <CastSheet
        visible={sheet === 'cast'}
        characters={characters}
        onClose={() => setSheet(null)}
        onVoice={(id, v) => {
          actions.setCharacterVoice(id, v);
          setCharacters(actions.listCharacters());
        }}
        onMerge={(from, into) => {
          actions.mergeCharacters(from, into);
          setCharacters(actions.listCharacters());
        }}
      />
      <MeaningSheet
        visible={sheet === 'meaning'}
        sentence={askedBlock && asked ? askedBlock.text.slice(asked.start, asked.end) : ''}
        context={askedBlock?.text ?? ''}
        initialLanguage={item.language.startsWith('hi') || locale.startsWith('hi') ? 'hi' : 'en'}
        lookUp={actions.lookUpWord}
        speak={actions.speak}
        onClose={() => setSheet(null)}
        onResume={() => {
          setSheet(null);
          setAsking(null);
          actions.play();
        }}
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
  failure: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  speed: { minWidth: 56, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', minHeight: 24 },
});
