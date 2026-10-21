import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/theme';

/** A 2 dp progress line with rounded ends (design system). Exposed to assistive tech as a progress bar. */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const { colors } = useTheme();
  const v = Math.min(1, Math.max(0, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      style={[styles.track, { backgroundColor: colors.hairline }]}
    >
      <View style={[styles.fill, { width: `${v * 100}%`, backgroundColor: colors.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 2, borderRadius: 1, overflow: 'hidden' },
  fill: { height: 2, borderRadius: 1 },
});
