import type { IconName } from '@lamplight/icons';
import { touch } from '@lamplight/tokens';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Icon } from './Icon';
import { Tappable } from './Tappable';
import { Text } from './Text';

export type ButtonKind = 'primary' | 'secondary' | 'quiet' | 'danger';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to the container's width. */
  block?: boolean;
  hint?: string;
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  loading,
  disabled,
  block,
  hint,
}: ButtonProps) {
  const { colors, radius } = useTheme();
  const fg =
    kind === 'primary'
      ? colors.accentInk
      : kind === 'danger'
        ? colors.danger
        : kind === 'quiet'
          ? colors.accent
          : colors.ink;
  const bg = kind === 'primary' ? colors.accent : kind === 'secondary' ? colors.surface : 'transparent';
  return (
    <Tappable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ busy: !!loading }}
      style={[
        styles.base,
        { backgroundColor: bg, borderRadius: radius.md, alignSelf: block ? 'stretch' : 'flex-start' },
        kind === 'secondary' && { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
        kind === 'quiet' && styles.quiet,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator size="small" color={fg} />
        ) : icon ? (
          <Icon name={icon} size={20} color={fg} />
        ) : null}
        <Text variant="bodyStrong" style={{ color: fg }} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: touch.minTarget, paddingHorizontal: 20, justifyContent: 'center' },
  quiet: { paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
