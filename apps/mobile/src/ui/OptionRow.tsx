import type { IconName } from '@lamplight/icons';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Icon } from './Icon';
import { Tappable } from './Tappable';
import { Text } from './Text';

/** A choice in a sheet or list: icon, label and a one-line explanation, as one accessible button. */
export function OptionRow({
  icon,
  label,
  hint,
  onPress,
  disabled,
  tone,
}: {
  icon: IconName;
  label: string;
  hint?: string;
  onPress(): void;
  disabled?: boolean;
  /** Destructive choices (delete) read in the danger colour. */
  tone?: 'danger';
}) {
  const { colors, space, radius } = useTheme();
  return (
    <Tappable
      onPress={onPress}
      disabled={disabled}
      pressScale={0.985}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      style={[styles.row, { gap: space.md, paddingVertical: space.sm }]}
    >
      <View style={[styles.icon, { backgroundColor: colors.surfaceSunk, borderRadius: radius.md }]}>
        <Icon name={icon} size={22} color={tone === 'danger' ? colors.danger : colors.accent} />
      </View>
      <View style={styles.text}>
        <Text variant="bodyStrong" tone={tone === 'danger' ? 'danger' : 'ink'}>
          {label}
        </Text>
        {hint ? (
          <Text variant="meta" tone="soft">
            {hint}
          </Text>
        ) : null}
      </View>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
});
