import { type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/theme';
import { floating } from './elevation';
import { useGutter } from './Screen';
import { Text } from './Text';

export interface SheetProps {
  visible: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
  /** Label for the dimmed backdrop, which closes the sheet when tapped. */
  closeLabel: string;
}

/**
 * A bottom sheet: modal over a 40% dim, sliding up (fading with reduce motion), closed by the back button,
 * Escape or a tap outside. Focus stays inside while it's open.
 *
 * shortcut: no drag-to-dismiss or snap points yet; add them with gesture-handler when a sheet needs to resize.
 */
export function Sheet({ visible, title, onClose, children, closeLabel }: SheetProps) {
  const { colors, space, radius, name, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const gutter = useGutter();
  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View
        entering={FadeIn.duration(160)}
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
      </Animated.View>
      <View pointerEvents="box-none" style={styles.layer}>
        <Animated.View
          entering={reduceMotion ? FadeIn.duration(140) : SlideInDown.duration(240)}
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              paddingTop: space.lg,
              paddingBottom: insets.bottom + space.lg,
              paddingHorizontal: gutter,
              gap: space.md,
            },
            floating(name, colors),
          ]}
        >
          <Text variant="title1" accessibilityRole="header">
            {title}
          </Text>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
});
