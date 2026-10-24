import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationTheme } from 'expo-router';
import { hideAsync, preventAutoHideAsync } from 'expo-splash-screen';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';
import { useStore } from 'zustand';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ServicesProvider, useServices } from '@/services/context';
import { deviceServices } from '@/services/device';
import { ThemeProvider, useTheme, type ThemePreference } from '@/theme/theme';
import { useAppFonts } from '@/theme/useAppFonts';
import { AnimatedSplash } from '@/ui/AnimatedSplash';
import { ToastHost } from '@/ui/Toast';

// Keep the splash up until the first screen can draw with its real fonts (no layout shift, R-ON-1).
preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const fontsReady = useAppFonts();
  useEffect(() => {
    if (fontsReady) hideAsync().catch(() => undefined);
  }, [fontsReady]);
  if (!fontsReady) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ServicesProvider services={deviceServices()}>
          <ThemedApp />
        </ServicesProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Theme follows the listener's appearance settings. */
function ThemedApp() {
  const { settings } = useServices();
  const theme = useStore(settings, (s) => s.theme);
  const motion = useStore(settings, (s) => s.motion);
  const [splash, setSplash] = useState(true);
  // Native parts (dialogs, pickers, the window's own colours) follow the app's theme, not only the system's.
  useEffect(() => systemScheme(theme), [theme]);
  return (
    <ThemeProvider preference={theme} motionPreference={motion}>
      <Navigation>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="player/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="import/compose" options={{ presentation: 'modal' }} />
        </Stack>
      </Navigation>
      <ToastHost />
      {splash ? <AnimatedSplash onDone={() => setSplash(false)} /> : null}
    </ThemeProvider>
  );
}

function systemScheme(preference: ThemePreference): void {
  Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
}

/**
 * React Navigation's own colours (behind every screen, during transitions and under a modal) taken from the
 * app's palette; without this they were its default light grey in both themes.
 */
function Navigation({ children }: { children: ReactNode }) {
  const { name, colors } = useTheme();
  const value = useMemo(() => {
    const base = name === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: name === 'dark',
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.bg,
        card: colors.bg,
        text: colors.ink,
        border: colors.hairline,
        notification: colors.accent,
      },
    };
  }, [name, colors]);
  return <NavigationTheme value={value}>{children}</NavigationTheme>;
}
