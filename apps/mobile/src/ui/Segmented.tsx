import { touch } from '@lamplight/tokens';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Tappable } from './Tappable';
import { Text } from './Text';

/** A short choice of two to four options (design system: SegmentedControl), announced as radio buttons. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(value: T): void;
  label: string;
}) {
  const { colors, radius } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[
        styles.track,
        { backgroundColor: colors.surfaceSunk, borderRadius: radius.md, borderColor: colors.inkFaint },
      ]}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Tappable
            key={o.value}
            onPress={() => onChange(o.value)}
            haptic={selected ? undefined : 'select'}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            pressScale={0.97}
            // 44 dp drawn inside the track's 3 dp padding and 1 dp border; the slop reaches the 48 dp minimum.
            hitSlop={SLOP}
            style={[
              styles.segment,
              { borderRadius: radius.md - 3 },
              selected && { backgroundColor: colors.surface },
            ]}
          >
            <Text
              variant={selected ? 'bodyStrong' : 'callout'}
              tone={selected ? 'ink' : 'soft'}
              numberOfLines={2}
              align="center"
            >
              {o.label}
            </Text>
          </Tappable>
        );
      })}
    </View>
  );
}

/** Vertical slop that makes a 44 dp segment a 48 dp touch target (Android's minimum). */
const SLOP = { top: (touch.minTarget - 44) / 2, bottom: (touch.minTarget - 44) / 2 };

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 3, borderWidth: 1 },
  segment: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
});
