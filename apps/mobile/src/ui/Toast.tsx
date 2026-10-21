import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from 'zustand';
import { useServices } from '@/services/context';
import { useTheme } from '@/theme/theme';
import { Tappable } from './Tappable';
import { Text } from './Text';
import { useGutter } from './Screen';

/**
 * The one toast on screen: bottom, above everything. It is announced once through the accessibility API (a live
 * region as well would make TalkBack read it twice).
 */
export function ToastHost() {
  const { toast } = useServices();
  const current = useStore(toast, (s) => s.current);
  const { colors, space, radius, name, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const gutter = useGutter();

  useEffect(() => {
    if (current) AccessibilityInfo.announceForAccessibility(current.message);
  }, [current]);

  if (!current) return null;
  const shadow =
    name === 'light'
      ? {
          shadowColor: 'rgb(40, 28, 12)',
          shadowOpacity: 0.12,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        }
      : { borderTopColor: colors.inkFaint }; // dark: a lighter top edge instead of a shadow
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.layer]}>
      <Animated.View
        key={current.id}
        entering={reduceMotion ? FadeIn.duration(120) : FadeInDown.duration(220)}
        exiting={reduceMotion ? FadeOut.duration(120) : FadeOutDown.duration(180)}
        style={[
          styles.toast,
          shadow,
          {
            marginHorizontal: gutter,
            marginBottom: insets.bottom + space.lg,
            padding: space.md,
            gap: space.md,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
            borderColor: colors.hairline,
          },
        ]}
      >
        <Text variant="callout" tone={current.tone === 'danger' ? 'danger' : 'ink'} style={styles.message}>
          {current.message}
        </Text>
        {current.action ? (
          <Tappable
            onPress={() => {
              current.action?.run();
              toast.getState().dismiss(current.id);
            }}
            accessibilityRole="button"
            style={styles.action}
          >
            <Text variant="bodyStrong" tone="accent">
              {current.action.label}
            </Text>
          </Tappable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { justifyContent: 'flex-end' },
  toast: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  message: { flex: 1 },
  action: { minHeight: 48, minWidth: 48, justifyContent: 'center' },
});
