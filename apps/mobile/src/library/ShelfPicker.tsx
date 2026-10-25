import { StyleSheet, View } from 'react-native';
import type { Shelf } from '@/data/library';
import { useT } from '@/i18n/useLocale';
import { useTheme } from '@/theme/theme';
import { Tappable } from '@/ui/Tappable';
import { Text } from '@/ui/Text';

const SHELVES: readonly Shelf[] = ['all', 'books', 'documents', 'articles'];

/**
 * The library's shelves as text tabs; the selected one is ink with an amber rule beneath it. The row wraps
 * rather than scrolls: at a large font size the last tab was cut off at the edge, with nothing to say the
 * row could be swiped.
 */
export function ShelfPicker({ shelf, onChange }: { shelf: Shelf; onChange(shelf: Shelf): void }) {
  const { colors, space } = useTheme();
  const t = useT();
  return (
    <View accessibilityRole="tablist" style={[styles.row, { columnGap: space.lg }]}>
      {SHELVES.map((s) => {
        const selected = s === shelf;
        return (
          <Tappable
            key={s}
            onPress={() => onChange(s)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={styles.tab}
          >
            <Text variant="bodyStrong" tone={selected ? 'ink' : 'faint'}>
              {t(`library.shelves.${s}`)}
            </Text>
            <View style={[styles.rule, { backgroundColor: selected ? colors.accent : 'transparent' }]} />
          </Tappable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  tab: { minHeight: 48, justifyContent: 'center' },
  rule: { height: 2, borderRadius: 1, marginTop: 4 },
});
