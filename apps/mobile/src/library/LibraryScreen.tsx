import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useStore } from 'zustand';
import type { LibraryItem } from '@/data/library';
import { useLocale, useT } from '@/i18n/useLocale';
import { useServices } from '@/services/context';
import { useTheme } from '@/theme/theme';
import { Button } from '@/ui/Button';
import { MINI_PLAYER_HEIGHT } from '@/ui/elevation';
import { IconButton } from '@/ui/IconButton';
import { Screen, useGutter } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { ContinueCard } from './ContinueCard';
import { LibraryRow } from './LibraryRow';
import { ShelfPicker } from './ShelfPicker';

export interface LibraryActions {
  onAdd(): void;
  onOpen(item: LibraryItem): void;
  onPlay(item: LibraryItem): void;
  /** Optional until the screens exist: a control without a destination is hidden, never dead. */
  onMore?(item: LibraryItem): void;
  onSearch?(): void;
  onSettings?(): void;
}

/** Home: what to continue, the shelves, and every item. Local data, so it appears without a spinner. */
export function LibraryScreen(actions: LibraryActions) {
  const { library, settings } = useServices();
  const { items, shelf, continueWith, importing } = useStore(library);
  const speed = useStore(settings, (s) => s.defaultSpeed);
  const locale = useLocale();
  const t = useT();
  const { space } = useTheme();
  const gutter = useGutter();

  useEffect(() => library.getState().refresh(), [library]);

  const renderItem = useCallback(
    ({ item }: { item: LibraryItem }) => (
      <LibraryRow
        item={item}
        locale={locale}
        speed={item.settings.speed ?? speed}
        onOpen={actions.onOpen}
        onPlay={actions.onPlay}
        onMore={actions.onMore}
      />
    ),
    [locale, speed, actions.onOpen, actions.onPlay, actions.onMore],
  );

  const header = (
    <View style={{ gap: space.lg, paddingBottom: space.xs }}>
      <View style={styles.titleRow}>
        <Text variant="display" accessibilityRole="header" style={styles.title}>
          {t('library.title')}
        </Text>
        {items.length > 0 || shelf !== 'all' ? (
          <IconButton icon="add" label={t('library.add')} onPress={actions.onAdd} disabled={importing} />
        ) : null}
        {actions.onSearch ? (
          <IconButton icon="search" label={t('library.search')} onPress={actions.onSearch} />
        ) : null}
        {actions.onSettings ? (
          <IconButton icon="settings" label={t('library.settings')} onPress={actions.onSettings} />
        ) : null}
      </View>
      {continueWith && shelf === 'all' ? (
        <ContinueCard
          item={continueWith}
          speed={continueWith.settings.speed ?? speed}
          onOpen={() => actions.onOpen(continueWith)}
          onPlay={() => actions.onPlay(continueWith)}
        />
      ) : null}
      <ShelfPicker shelf={shelf} onChange={(s) => library.getState().setView({ shelf: s })} />
    </View>
  );

  return (
    <Screen>
      <FlashList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={[styles.empty, { gap: space.lg, paddingVertical: space.x4 }]}>
            <Text variant="body" tone="soft" align="center">
              {t(`empty.${shelf}`)}
            </Text>
            <View style={styles.center}>
              <Button label={t('library.add')} icon="add" onPress={actions.onAdd} loading={importing} />
            </View>
          </View>
        }
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingTop: space.md,
          paddingBottom: MINI_PLAYER_HEIGHT + space.x4,
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, marginLeft: -1 },
  empty: { alignItems: 'center' },
  center: { alignSelf: 'center' },
});
