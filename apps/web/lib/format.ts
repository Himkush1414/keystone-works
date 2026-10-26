// Kept apart from samples.ts so client components can use them without bundling the sample library.

export const LANGUAGE_NAMES: Record<'en' | 'hi', string> = { en: 'English', hi: 'हिन्दी' };

/** "1:28" */
export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
