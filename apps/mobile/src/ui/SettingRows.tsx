import { StyleSheet, Switch, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Icon } from './Icon';
import { Tappable } from './Tappable';
import { Text } from './Text';

/** An on/off setting: the whole row toggles, and it is announced as a switch with its state. */
export function SwitchRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange(value: boolean): void;
}) {
  const { colors, space } = useTheme();
  return (
    <Tappable
      onPress={() => onChange(!value)}
      pressScale={0.99}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={description ? `${label}. ${description}` : label}
      style={[styles.row, { gap: space.md }]}
    >
      <View style={styles.text}>
        <Text variant="body">{label}</Text>
        {description ? (
          <Text variant="meta" tone="soft">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accent, false: colors.hairline }}
        thumbColor={colors.surface}
        // @ts-expect-error activeThumbColor exists only in react-native-web, whose default is an off-palette teal
        activeThumbColor={colors.surface}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      />
    </Tappable>
  );
}

/** One option in a list where exactly one is chosen (Cast mode, language). */
export function ChoiceRow({
  label,
  description,
  selected,
  onPress,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress(): void;
}) {
  const { colors, space } = useTheme();
  return (
    <Tappable
      onPress={onPress}
      pressScale={0.99}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      style={[styles.row, { gap: space.md }]}
    >
      <View style={styles.text}>
        <Text variant={selected ? 'bodyStrong' : 'body'}>{label}</Text>
        {description ? (
          <Text variant="meta" tone="soft">
            {description}
          </Text>
        ) : null}
      </View>
      <View style={styles.check}>
        {selected ? <Icon name="check" size={22} color={colors.accent} /> : null}
      </View>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: 8 },
  text: { flex: 1, gap: 2 },
  check: { width: 24, alignItems: 'center' },
});
