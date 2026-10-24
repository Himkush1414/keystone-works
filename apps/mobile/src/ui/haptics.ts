import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** tap: a light knock for actions (play, a primary button); select: a tick for choosing (a segment, a switch). */
export type HapticKind = 'tap' | 'select';

/** Fires a haptic; silently does nothing where there is no vibration motor (web, some tablets). */
export function haptic(kind: HapticKind): void {
  if (Platform.OS === 'web') return;
  const p =
    kind === 'tap' ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) : Haptics.selectionAsync();
  void p.catch(() => undefined);
}
