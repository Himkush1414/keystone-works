import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LamplightEngine from '../../modules/lamplight-engine';
import { isDarkColor } from '@/theme/color';
import { useTheme } from '@/theme/theme';

/** Side gutter by width: 16 on the smallest phones, 20 on phones, 32 on tablets. */
export function gutterFor(width: number): number {
  if (width < 360) return 16;
  if (width < 600) return 20;
  return 32;
}

export function useGutter(): number {
  return gutterFor(useWindowDimensions().width);
}

export interface ScreenProps {
  children: ReactNode;
  /** Apply the top safe-area inset (off for screens under a header or inside a modal sheet). */
  top?: boolean;
  bottom?: boolean;
  padded?: boolean;
  background?: string;
  style?: StyleProp<ViewStyle>;
}

/** Page container: theme background, safe areas, status bar style and the responsive gutter. */
export function Screen({
  children,
  top = true,
  bottom = false,
  padded = false,
  background,
  style,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bg = background ?? colors.bg;
  const dark = isDarkColor(bg);
  // The window behind the app and the navigation bar follow the screen in front (the reader's sepia or
  // night theme can differ from the app's), so no other colour shows at the edges or during transitions.
  useFocusEffect(
    useCallback(() => {
      void LamplightEngine.setSystemBars(dark, bg).catch(() => undefined);
    }, [dark, bg]),
  );
  const gutter = useGutter();
  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: bg,
          paddingTop: top ? insets.top : 0,
          paddingBottom: bottom ? insets.bottom : 0,
          paddingHorizontal: padded ? gutter : 0,
        },
        style,
      ]}
    >
      <StatusBar style={dark ? 'light' : 'dark'} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
