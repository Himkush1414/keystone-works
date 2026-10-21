import { TextInput, type TextInputProps } from 'react-native';
import { FONT } from '@/theme/fonts';
import { useTheme } from '@/theme/theme';

/**
 * A text input on the sunk fill. The 1 dp border keeps the field's edge at 3:1 or more against the page on
 * both themes (R-AX-2); the fill alone measures about 1.05:1.
 */
export function TextField({
  label,
  reader,
  style,
  ...rest
}: TextInputProps & { label: string; reader?: boolean }) {
  const { colors, space, radius } = useTheme();
  return (
    <TextInput
      accessibilityLabel={label}
      placeholderTextColor={colors.inkFaint}
      {...rest}
      style={[
        {
          backgroundColor: colors.surfaceSunk,
          borderWidth: 1,
          borderColor: colors.inkFaint,
          borderRadius: radius.sm,
          color: colors.ink,
          fontFamily: reader ? FONT.reader : FONT.ui,
          fontSize: reader ? 17 : 16,
          paddingHorizontal: space.md,
          paddingVertical: space.sm,
          minHeight: 48,
        },
        style,
      ]}
    />
  );
}
