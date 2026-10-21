import { FlashList, type FlashListRef } from '@shopify/flash-list';
import type { ReaderTheme } from '@lamplight/tokens';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text as RNText, View, type TextStyle } from 'react-native';
import { READER_FONTS, FONT, type ReaderFont } from '@/theme/fonts';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import type { ReadBlock, Run } from './readAlong';

export interface ReadAlongProps {
  blocks: ReadBlock[];
  /** Sentence being spoken. */
  current: number;
  /** Block holding the current sentence. */
  currentBlock: number;
  /** Display range of the word being spoken, inside the current block. */
  word: { start: number; end: number } | null;
  theme: ReaderTheme;
  font: ReaderFont;
  size: number;
  lineHeight: number;
  /** Skipped text dimmed (true) or hidden (false). */
  showSkipped: boolean;
  onSentencePress(index: number): void;
  backToVoiceLabel: string;
}

/**
 * The text, lit as it is read: the current sentence glows, the current word is underlined, and the view
 * follows the voice until the listener scrolls away; then a pill brings it back.
 */
export function ReadAlong(props: ReadAlongProps) {
  const { blocks, currentBlock, theme } = props;
  const { space, reduceMotion } = useTheme();
  const list = useRef<FlashListRef<ReadBlock>>(null);
  const [following, setFollowing] = useState(true);

  useEffect(() => {
    if (!following || currentBlock < 0) return;
    list.current
      ?.scrollToIndex({ index: currentBlock, viewPosition: 0.3, animated: !reduceMotion })
      .catch(() => {});
  }, [currentBlock, following, reduceMotion]);

  const renderItem = useCallback(
    ({ item }: { item: ReadBlock }) => (
      <BlockText
        block={item}
        current={item.index === props.currentBlock ? props.current : -1}
        word={item.index === props.currentBlock ? props.word : null}
        theme={theme}
        font={props.font}
        size={props.size}
        lineHeight={props.lineHeight}
        showSkipped={props.showSkipped}
        onSentencePress={props.onSentencePress}
      />
    ),
    [
      props.currentBlock,
      props.current,
      props.word,
      theme,
      props.font,
      props.size,
      props.lineHeight,
      props.showSkipped,
      props.onSentencePress,
    ],
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <FlashList
        ref={list}
        data={blocks}
        keyExtractor={(b) => String(b.index)}
        renderItem={renderItem}
        extraData={`${props.current}:${props.word?.start ?? -1}`}
        onScrollBeginDrag={() => setFollowing(false)}
        contentContainerStyle={{ paddingVertical: space.xl }}
      />
      {following ? null : (
        <View style={[styles.pill, { bottom: space.lg }]} pointerEvents="box-none">
          <Button label={props.backToVoiceLabel} icon="headphones" onPress={() => setFollowing(true)} />
        </View>
      )}
    </View>
  );
}

const HEADING_SCALE: Record<number, number> = { 1: 1.45, 2: 1.3, 3: 1.18 };

const BlockText = memo(function BlockText({
  block,
  current,
  word,
  theme,
  font,
  size,
  lineHeight,
  showSkipped,
  onSentencePress,
}: Omit<ReadAlongProps, 'blocks' | 'currentBlock' | 'backToVoiceLabel'> & { block: ReadBlock }) {
  const { space } = useTheme();
  if (!block.text.trim()) return <View style={{ height: space.lg }} />;
  const heading = block.kind === 'heading';
  const fontSize = heading ? Math.round(size * (HEADING_SCALE[block.level ?? 2] ?? 1.1)) : size;
  const base: TextStyle = {
    fontFamily: heading ? FONT.display : READER_FONTS[font].regular,
    fontSize,
    lineHeight: Math.round(fontSize * (heading ? 1.25 : lineHeight)),
    color: theme.ink,
    fontStyle: block.kind === 'quote' ? 'italic' : 'normal',
  };
  return (
    <View
      style={[styles.block, { paddingHorizontal: space.lg, marginBottom: heading ? space.md : space.lg }]}
    >
      <RNText style={base} accessibilityRole={heading ? 'header' : 'text'}>
        {block.runs.map((run) => (
          <RunText
            key={run.start}
            text={block.text}
            run={run}
            current={run.sentence !== null && run.sentence === current}
            word={word}
            theme={theme}
            showSkipped={showSkipped}
            onSentencePress={onSentencePress}
          />
        ))}
      </RNText>
    </View>
  );
});

function RunText({
  text,
  run,
  current,
  word,
  theme,
  showSkipped,
  onSentencePress,
}: {
  text: string;
  run: Run;
  current: boolean;
  word: { start: number; end: number } | null;
  theme: ReaderTheme;
  showSkipped: boolean;
  onSentencePress(index: number): void;
}) {
  if (run.skipped && !showSkipped) return null;
  const style: TextStyle = {
    ...(current ? { backgroundColor: theme.glow } : null),
    ...(run.skipped ? { color: theme.inkSoft, opacity: 0.6 } : null),
  };
  const press = run.sentence === null ? undefined : () => onSentencePress(run.sentence as number);
  // Underline only the slice of the current word that falls inside this run.
  if (current && word && word.end > run.start && word.start < run.end) {
    const a = Math.max(run.start, word.start);
    const b = Math.min(run.end, word.end);
    return (
      <RNText style={style} onPress={press} suppressHighlighting>
        {text.slice(run.start, a)}
        <RNText style={{ textDecorationLine: 'underline', textDecorationColor: theme.underline }}>
          {text.slice(a, b)}
        </RNText>
        {text.slice(b, run.end)}
      </RNText>
    );
  }
  return (
    <RNText style={style} onPress={press} suppressHighlighting>
      {text.slice(run.start, run.end)}
    </RNText>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  block: { alignSelf: 'center', width: '100%', maxWidth: 680 },
  pill: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});
