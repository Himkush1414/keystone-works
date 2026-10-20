import { motion, palettes, radius, space, type Palette, type ThemeName } from '@lamplight/tokens';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';
export type MotionPreference = 'system' | 'reduce' | 'full';

export interface Theme {
  name: ThemeName;
  colors: Palette;
  space: typeof space;
  radius: typeof radius;
  motion: typeof motion;
  /** True when animations should be replaced with short fades. */
  reduceMotion: boolean;
}

const ThemeContext = createContext<Theme>({
  name: 'light',
  colors: palettes.light,
  space,
  radius,
  motion,
  reduceMotion: false,
});

/** Follows the operating system's reduce-motion setting and updates live. */
function useSystemReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => mounted && setReduce(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

export function ThemeProvider({
  preference = 'system',
  motionPreference = 'system',
  children,
}: {
  preference?: ThemePreference;
  motionPreference?: MotionPreference;
  children: ReactNode;
}) {
  const system = useColorScheme();
  const systemReduce = useSystemReduceMotion();
  const name: ThemeName = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const reduceMotion = motionPreference === 'system' ? systemReduce : motionPreference === 'reduce';
  const value = useMemo<Theme>(
    () => ({ name, colors: palettes[name], space, radius, motion, reduceMotion }),
    [name, reduceMotion],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): Theme => useContext(ThemeContext);
