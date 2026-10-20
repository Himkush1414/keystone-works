import { type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface TappableProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  /** How far the element shrinks while pressed (0.97 default). */
  pressScale?: number;
}

/**
 * Press feedback without ripples: a small spring scale and a dim, or a plain dim when reduce motion is on.
 * All interactive surfaces in the app are built on this.
 */
export function Tappable({
  style,
  children,
  pressScale = 0.97,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: TappableProps) {
  const { motion, reduceMotion } = useTheme();
  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    opacity: disabled ? 0.4 : 1 - pressed.value * 0.18,
    transform: reduceMotion ? [] : [{ scale: 1 - pressed.value * (1 - pressScale) }],
  }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      accessibilityState={{ disabled: !!disabled, ...rest.accessibilityState }}
      onPressIn={(e) => {
        pressed.value = reduceMotion ? withTiming(1, { duration: 80 }) : withSpring(1, motion.spring.snappy);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = reduceMotion ? withTiming(0, { duration: 120 }) : withSpring(0, motion.spring.snappy);
        onPressOut?.(e);
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
