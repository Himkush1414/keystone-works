import { Stack } from 'expo-router';
import { hideAsync, preventAutoHideAsync } from 'expo-splash-screen';
import { useEffect } from 'react';
import { useStore } from 'zustand';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ServicesProvider, useServices } from '@/services/context';
import { deviceServices } from '@/services/device';
import { ThemeProvider } from '@/theme/theme';
import { useAppFonts } from '@/theme/useAppFonts';
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
  return (
    <ThemeProvider preference={theme} motionPreference={motion}>
      <Stack screenOptions={{ headerShown: false }} />
      <ToastHost />
    </ThemeProvider>
  );
}
