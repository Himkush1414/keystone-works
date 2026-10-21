import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LibraryItem } from '@/data/library';
import { translate, type Locale } from '@/i18n/translate';
import { useTheme } from '@/theme/theme';
import { Cover } from '@/ui/Cover';
import { ProgressBar } from '@/ui/ProgressBar';
import { Tappable } from '@/ui/Tappable';
import { Text } from '@/ui/Text';
import { itemState, rowMeta } from './present';

export interface LibraryRowProps {
  item: LibraryItem;
  locale: Locale;
  speed: number;
  onOpen(item: LibraryItem): void;
  onPlay(item: LibraryItem): void;
  onMore(item: LibraryItem): void;
}

/** One library item: cover, title, author and state, progress. Tap opens; actions are also exposed to TalkBack. */
export const LibraryRow = memo(function LibraryRow({
  item,
  locale,
  speed,
  onOpen,
  onPlay,
  onMore,
}: LibraryRowProps) {
  const { space, colors } = useTheme();
  const state = itemState(item);
  const meta = rowMeta(item, locale, speed);
  const percent = Math.round(item.progress * 100);
  return (
    <Tappable
      onPress={() => onOpen(item)}
      onLongPress={() => onMore(item)}
      pressScale={0.985}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${meta}`}
      accessibilityActions={[
        { name: 'activate', label: translate(locale, 'player.play') },
        { name: 'longpress', label: translate(locale, 'a11y.itemActions', { title: item.title }) },
      ]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'longpress' ? onMore(item) : onPlay(item))}
      style={[styles.row, { paddingVertical: space.sm, gap: space.md }]}
    >
      <Cover title={item.title} author={item.author} uri={item.coverPath} width={48} />
      <View style={styles.text}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {item.title}
        </Text>
        <Text variant="meta" tone={state === 'failed' ? 'danger' : 'soft'} numberOfLines={1}>
          {meta}
        </Text>
        {state === 'inProgress' ? (
          <View style={{ marginTop: space.xs, maxWidth: 160 }}>
            <ProgressBar value={item.progress} label={translate(locale, 'a11y.progressValue', { percent })} />
          </View>
        ) : null}
      </View>
      <View style={[styles.divider, { backgroundColor: colors.hairline }]} />
    </Tappable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1, gap: 2 },
  divider: { position: 'absolute', left: 64, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
});
