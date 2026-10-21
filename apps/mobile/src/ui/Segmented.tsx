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
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            pressScale={0.97}
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

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 3, borderWidth: 1 },
  segment: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
});
