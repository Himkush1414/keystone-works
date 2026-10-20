import type { TextStyle } from 'react-native';

/**
 * Font family names. On Android and iOS the fonts are embedded at build time by the expo-font config plugin
 * and addressed by file name; on the web they are loaded at runtime under the same names (see useAppFonts).
 */
export const FONT = {
  display: 'Fraunces-SemiBold',
  displayLarge: 'Fraunces-Display',
  displayItalic: 'Fraunces-Italic',
  ui: 'AtkinsonHyperlegibleNext-Regular',
  uiMedium: 'AtkinsonHyperlegibleNext-Medium',
  uiBold: 'AtkinsonHyperlegibleNext-Bold',
  uiItalic: 'AtkinsonHyperlegibleNext-Italic',
  reader: 'Literata-Regular',
  readerItalic: 'Literata-Italic',
  readerBold: 'Literata-Bold',
  dyslexic: 'OpenDyslexic-Regular',
  dyslexicBold: 'OpenDyslexic-Bold',
} as const;

export type FontKey = keyof typeof FONT;

/** Files for runtime loading (web). Kept next to the names so they can't drift apart. */
export const FONT_FILES: Record<string, number> = {
  [FONT.display]: require('../../assets/fonts/Fraunces-SemiBold.ttf'),
  [FONT.displayLarge]: require('../../assets/fonts/Fraunces-Display.ttf'),
  [FONT.displayItalic]: require('../../assets/fonts/Fraunces-Italic.ttf'),
  [FONT.ui]: require('../../assets/fonts/AtkinsonHyperlegibleNext-Regular.ttf'),
  [FONT.uiMedium]: require('../../assets/fonts/AtkinsonHyperlegibleNext-Medium.ttf'),
  [FONT.uiBold]: require('../../assets/fonts/AtkinsonHyperlegibleNext-Bold.ttf'),
  [FONT.uiItalic]: require('../../assets/fonts/AtkinsonHyperlegibleNext-Italic.ttf'),
  [FONT.reader]: require('../../assets/fonts/Literata-Regular.ttf'),
  [FONT.readerItalic]: require('../../assets/fonts/Literata-Italic.ttf'),
  [FONT.readerBold]: require('../../assets/fonts/Literata-Bold.ttf'),
  [FONT.dyslexic]: require('../../assets/fonts/OpenDyslexic-Regular.otf'),
  [FONT.dyslexicBold]: require('../../assets/fonts/OpenDyslexic-Bold.otf'),
};

/** Reader typefaces offered in the appearance sheet. */
export type ReaderFont = 'literata' | 'atkinson' | 'opendyslexic';

export const READER_FONTS: Record<
  ReaderFont,
  { regular: string; bold: string; italic: string; label: string }
> = {
  literata: { regular: FONT.reader, bold: FONT.readerBold, italic: FONT.readerItalic, label: 'Literata' },
  atkinson: { regular: FONT.ui, bold: FONT.uiBold, italic: FONT.uiItalic, label: 'Atkinson Hyperlegible' },
  opendyslexic: {
    regular: FONT.dyslexic,
    bold: FONT.dyslexicBold,
    italic: FONT.dyslexic,
    label: 'OpenDyslexic',
  },
};

/** Static fonts carry their weight in the file, so never ask the platform to synthesise bold. */
export const noSynthesis: Pick<TextStyle, 'fontWeight'> = { fontWeight: 'normal' };
