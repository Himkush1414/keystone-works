import type { Palette, ThemeName } from '@lamplight/tokens';
import type { ViewStyle } from 'react-native';

/**
 * The one elevation for floating surfaces (toast, mini player, sheets): a soft shadow on paper; on the dark
 * theme, where shadows vanish, a lighter top edge instead (design system).
 */
export function floating(theme: ThemeName, colors: Palette): ViewStyle {
  return theme === 'light'
    ? {
        shadowColor: 'rgb(40, 28, 12)',
        shadowOpacity: 0.12,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
        borderColor: colors.hairline,
      }
    : { borderColor: colors.hairline, borderTopColor: colors.inkFaint };
}

/** Height the mini player takes above the bottom inset, so lists and toasts can make room for it. */
export const MINI_PLAYER_HEIGHT = 64;
