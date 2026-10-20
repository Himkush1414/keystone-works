import type { IconName } from '@lamplight/icons';
import { touch } from '@lamplight/tokens';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Icon } from './Icon';
import { Tappable } from './Tappable';

export interface IconButtonProps {
  icon: IconName;
  /** Required: icon-only controls must always have a spoken label. */
  label: string;
  onPress: () => void;
  size?: number;
  color?: string;
  /** Filled circular background (e.g. the main play button). */
  filled?: boolean;
  disabled?: boolean;
  selected?: boolean;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  label,
  onPress,
  size = 24,
  color,
  filled,
  disabled,
  selected,
  hint,
  style,
}: IconButtonProps) {
  const { colors } = useTheme();
  const box = Math.max(touch.minTarget, filled ? size * 2.4 : size + 24);
  return (
    <Tappable
      onPress={onPress}
      disabled={disabled}
      pressScale={filled ? 0.94 : 0.9}
      hitSlop={box < 56 ? 4 : 0}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={[
        styles.base,
        { width: box, height: box, borderRadius: box / 2 },
        filled && { backgroundColor: colors.accent },
        style,
      ]}
    >
      <Icon name={icon} size={size} color={color ?? (filled ? colors.accentInk : colors.ink)} />
    </Tappable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
