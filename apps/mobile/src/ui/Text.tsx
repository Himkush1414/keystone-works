import { type, type TypeVariant } from '@lamplight/tokens';
import { Text as RNText, type TextProps, type TextStyle } from 'react-native';
import { FONT } from '@/theme/fonts';
import { useTheme } from '@/theme/theme';

export type TextTone = 'ink' | 'soft' | 'faint' | 'accent' | 'danger' | 'success' | 'onAccent';

const FAMILY: Record<TypeVariant, string> = {
  display: FONT.display,
  title1: FONT.display,
  title2: FONT.uiBold,
  body: FONT.ui,
  bodyStrong: FONT.uiBold,
  callout: FONT.ui,
  meta: FONT.ui,
  micro: FONT.uiBold,
};

/** Fixed-height chrome (labels, chips) caps font scaling so layouts never clip; prose scales freely. */
const MAX_SCALE: Partial<Record<TypeVariant, number>> = { micro: 1.6, meta: 2 };

export function textStyle(variant: TypeVariant): TextStyle {
  const t = type[variant];
  return {
    fontFamily: FAMILY[variant],
    fontSize: t.size,
    lineHeight: t.lineHeight,
    letterSpacing: 'tracking' in t ? t.tracking : 0,
    fontWeight: 'normal',
    ...('smallCaps' in t && t.smallCaps ? { textTransform: 'uppercase' as const } : null),
  };
}

export interface LText extends TextProps {
  variant?: TypeVariant;
  tone?: TextTone;
  /** Tabular figures for numbers that change (times, speeds, percentages). */
  numeric?: boolean;
  align?: TextStyle['textAlign'];
}

export function Text({
  variant = 'body',
  tone = 'ink',
  numeric,
  align,
  style,
  maxFontSizeMultiplier,
  ...rest
}: LText) {
  const { colors } = useTheme();
  const color = {
    ink: colors.ink,
    soft: colors.inkSoft,
    faint: colors.inkFaint,
    accent: colors.accent,
    danger: colors.danger,
    success: colors.success,
    onAccent: colors.accentInk,
  }[tone];
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_SCALE[variant]}
      style={[
        textStyle(variant),
        { color },
        numeric ? { fontVariant: ['tabular-nums'] } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
      {...rest}
    />
  );
}
