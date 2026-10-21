import { useFonts } from 'expo-font';
import { Platform } from 'react-native';
import { FONT_FILES } from './fonts';

/**
 * True once the app's fonts can be used. Android and iOS embed them at build time (expo-font config plugin),
 * so they are ready immediately; the web loads the same files at runtime. A font that fails to load falls
 * back to the system face rather than blocking the app.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(Platform.OS === 'web' ? FONT_FILES : {});
  return Platform.OS !== 'web' || loaded || error !== null;
}
