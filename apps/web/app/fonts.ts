import {
  Atkinson_Hyperlegible_Next,
  Fraunces,
  Literata,
  Noto_Sans_Devanagari,
  Noto_Serif_Devanagari,
} from 'next/font/google';
import localFont from 'next/font/local';

/** The app's three families (display, interface, reader), self-hosted and subset at build time. */
export const display = Fraunces({
  subsets: ['latin'],
  axes: ['opsz', 'SOFT'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

export const ui = Atkinson_Hyperlegible_Next({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-ui',
  display: 'swap',
  // Next has no metrics for this family yet; the system fallback is close enough in width.
  adjustFontFallback: false,
});

export const reader = Literata({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-reader',
  display: 'swap',
  preload: false,
});

/** Devanagari partners for the Hindi samples, loaded only where Hindi is shown. */
export const readerHi = Noto_Serif_Devanagari({
  subsets: ['devanagari'],
  weight: ['400', '600'],
  variable: '--font-reader-hi',
  display: 'swap',
  preload: false,
});

export const uiHi = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  weight: ['400', '600'],
  variable: '--font-ui-hi',
  display: 'swap',
  preload: false,
});

/** The app's dyslexia-friendly reading font, for the reading-appearance demo only. */
export const dyslexic = localFont({
  src: './fonts/OpenDyslexic-Regular.otf',
  variable: '--font-dyslexic',
  display: 'swap',
  preload: false,
});

export const fontVariables = [display, ui, reader, readerHi, uiHi, dyslexic].map((f) => f.variable).join(' ');
