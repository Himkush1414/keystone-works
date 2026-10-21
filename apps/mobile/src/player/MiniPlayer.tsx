import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from 'zustand';
import { useT } from '@/i18n/useLocale';
import { useServices } from '@/services/context';
import { useTheme } from '@/theme/theme';
import { Cover } from '@/ui/Cover';
import { floating, MINI_PLAYER_HEIGHT } from '@/ui/elevation';
import { IconButton } from '@/ui/IconButton';
import { useGutter } from '@/ui/Screen';
import { Tappable } from '@/ui/Tappable';
import { Text } from '@/ui/Text';

/**
 * The pill at the bottom of every library screen while something is loaded: what's playing, play/pause, and
 * how far along it is. Tapping it opens the full player.
 */
export function MiniPlayer({ onPlay, onPause }: { onPlay(): void; onPause(): void }) {
  const { player, toast } = useServices();
  const queue = useStore(player, (s) => s.queue);
  const playing = useStore(player, (s) => s.native.playing);
  const progress = useStore(
    player,
    (s) => s.timeline?.progress(s.progress.index, s.progress.positionMs) ?? 0,
  );
  const { colors, space, name } = useTheme();
  const insets = useSafeAreaInsets();
  const gutter = useGutter();
  const t = useT();
  const visible = queue !== null;

  // Toasts sit above the pill while it's showing.
  useEffect(() => {
    toast.getState().setBottomInset(visible ? MINI_PLAYER_HEIGHT + space.xs : 0);
    return () => toast.getState().setBottomInset(0);
  }, [toast, visible, space.xs]);

  if (!queue) return null;

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.layer]}>
      <Tappable
        onPress={() => router.push(`/player/${queue.docId}`)}
        pressScale={0.985}
        accessibilityRole="button"
        accessibilityLabel={queue.title}
        accessibilityHint={t('player.expand')}
        style={[
          styles.pill,
          {
            height: MINI_PLAYER_HEIGHT,
            marginHorizontal: gutter,
            marginBottom: insets.bottom + space.xs,
            paddingLeft: space.xs,
            backgroundColor: colors.surface,
          },
          floating(name, colors),
        ]}
      >
        <View style={styles.cover}>
          <Cover title={queue.title} author={queue.author} uri={queue.artworkUri} width={36} />
        </View>
        <View style={styles.text}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {queue.title}
          </Text>
          {queue.author ? (
            <Text variant="meta" tone="soft" numberOfLines={1}>
              {queue.author}
            </Text>
          ) : null}
        </View>
        <IconButton
          icon={playing ? 'pause' : 'play'}
          label={t(playing ? 'player.pause' : 'player.play')}
          onPress={playing ? onPause : onPlay}
        />
        <View style={[styles.track, { backgroundColor: colors.hairline }]}>
          <View
            style={[
              styles.fill,
              { width: `${Math.min(1, progress) * 100}%`, backgroundColor: colors.accent },
            ]}
          />
        </View>
      </Tappable>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { justifyContent: 'flex-end' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cover: { marginRight: 12 },
  text: { flex: 1 },
  track: { position: 'absolute', left: 24, right: 24, bottom: 0, height: 2 },
  fill: { height: 2 },
});
