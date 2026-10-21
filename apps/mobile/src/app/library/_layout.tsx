import { Stack } from 'expo-router';

/** The library stack; the mini player overlay will live here, above every library screen. */
export default function LibraryLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
