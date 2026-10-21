import { formatNumber, type Locale } from '../i18n/translate';

/** The speed button's stops: the dial's detents (R-PL-4), with 0.75 for slower listening. */
export const SPEED_STOPS = [1, 1.25, 1.5, 2, 0.75] as const;

/** The next stop after `speed`; a speed set elsewhere (the dial) moves to the next stop above it. */
export function nextSpeed(speed: number): number {
  const i = SPEED_STOPS.findIndex((s) => Math.abs(s - speed) < 0.001);
  if (i >= 0) return SPEED_STOPS[(i + 1) % SPEED_STOPS.length] ?? 1;
  return [...SPEED_STOPS].sort((a, b) => a - b).find((s) => s > speed) ?? SPEED_STOPS[0];
}

/** "1.25×", "1,25×" (de, fr, es, pt), "2×". */
export function formatSpeed(locale: Locale, speed: number): string {
  return `${formatNumber(locale, speed)}×`;
}
