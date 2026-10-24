import { palettes } from '@lamplight/tokens';
import { useEffect, useRef } from 'react';
import { Image, StyleSheet, useColorScheme, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { FONT } from '@/theme/fonts';
import { useTheme } from '@/theme/theme';

/** The splash icon's size in the system splash (app.config.ts, expo-splash-screen `imageWidth`). */
const ICON = 168;

/**
 * Takes over from the system splash at the same place and size, so the hand-off is invisible, then the
 * flame breathes once, the wordmark rises, and the whole layer fades to reveal the app laid out beneath
 * (feature spec F1.2–3, doc 15). With reduce motion it is a single crossfade. Total under 900 ms.
 */
export function AnimatedSplash({ onDone }: { onDone(): void }) {
  // The system splash follows the system appearance, so this layer does too.
  const scheme = useColorScheme();
  const { motion, reduceMotion } = useTheme();
  const bg = scheme === 'dark' ? palettes.dark.bg : palettes.light.bg;
  const ink = scheme === 'dark' ? palettes.dark.ink : palettes.light.ink;
  const flame = useSharedValue(reduceMotion ? 1 : 0.94);
  const word = useSharedValue(0);
  const layer = useSharedValue(1);

  // The parent may re-render (and pass a new onDone) mid-animation; that must not restart it.
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const finish = () => done.current();
    if (reduceMotion) {
      layer.value = withDelay(
        120,
        withTiming(0, { duration: 280 }, (ok) => ok && runOnJS(finish)()),
      );
      return;
    }
    flame.value = withSpring(1, motion.spring.breath);
    word.value = withTiming(1, {
      duration: motion.duration.long,
      easing: Easing.bezier(...motion.easing.out),
    });
    layer.value = withSequence(
      withDelay(560, withTiming(1, { duration: 0 })),
      withTiming(0, { duration: 280 }, (ok) => ok && runOnJS(finish)()),
    );
  }, [flame, word, layer, motion, reduceMotion]);

  const layerStyle = useAnimatedStyle(() => ({ opacity: layer.value }));
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: flame.value }] }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0 : word.value,
    transform: [{ translateY: (1 - word.value) * 8 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: bg }, layerStyle]}
    >
      <Animated.View style={flameStyle}>
        <Image source={require('../../assets/brand/splash-icon.png')} style={{ width: ICON, height: ICON }} />
      </Animated.View>
      <View style={styles.wordmark}>
        <Animated.Text style={[{ fontFamily: FONT.display, fontSize: 34, color: ink }, wordStyle]}>
          Lamplight
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  wordmark: { position: 'absolute', top: '50%', marginTop: ICON / 2 + 8 },
});
