import { StyleSheet, useWindowDimensions, View } from 'react-native';
import type { LibraryItem } from '@/data/library';
import { useLocale, useT } from '@/i18n/useLocale';
import { useTheme } from '@/theme/theme';
import { Cover } from '@/ui/Cover';
import { IconButton } from '@/ui/IconButton';
import { ProgressBar } from '@/ui/ProgressBar';
import { Tappable } from '@/ui/Tappable';
import { Text } from '@/ui/Text';
import { rowMeta } from './present';

/** The first thing on the home screen: the item being listened to, one tap from playing again. */
export function ContinueCard({
  item,
  speed,
  onOpen,
  onPlay,
}: {
  item: LibraryItem;
  speed: number;
  onOpen(): void;
  onPlay(): void;
}) {
  const { colors, space, radius } = useTheme();
  const locale = useLocale();
  const t = useT();
  const percent = Math.round(item.progress * 100);
  // On the narrowest phones a smaller cover leaves the title room to wrap between words.
  const coverWidth = useWindowDimensions().width < 360 ? 56 : 72;
  return (
    <Tappable
      onPress={onOpen}
      pressScale={0.985}
      accessibilityRole="button"
      accessibilityLabel={`${t('library.continue')}: ${item.title}. ${rowMeta(item, locale, speed)}`}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.hairline,
          borderRadius: radius.md,
          padding: space.md,
          gap: space.md,
        },
      ]}
    >
      <Cover title={item.title} author={item.author} uri={item.coverPath} width={coverWidth} />
      <View style={styles.body}>
        <Text variant="micro" tone="accent">
          {t('library.continue')}
        </Text>
        <Text variant="title2" numberOfLines={2}>
          {item.title}
        </Text>
        <Text variant="meta" tone="soft" numberOfLines={1}>
          {rowMeta(item, locale, speed, false)}
        </Text>
        <View style={{ marginTop: space.xs }}>
          <ProgressBar value={item.progress} label={t('a11y.progressValue', { percent })} />
        </View>
      </View>
      <IconButton
        icon="play"
        label={`${t('player.play')}: ${item.title}`}
        onPress={onPlay}
        filled
        size={22}
      />
    </Tappable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  body: { flex: 1, gap: 2 },
});
