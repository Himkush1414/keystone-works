/** Colour tokens. Both themes are designed, not inverted; pairs are contrast-tested in test/contrast.test.ts. */

export interface Palette {
  bg: string;
  surface: string;
  surfaceSunk: string;
  hairline: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  accent: string;
  accentInk: string;
  glow: string;
  underline: string;
  danger: string;
  success: string;
  scrim: string;
}

export type ThemeName = 'light' | 'dark';

export const palettes: Record<ThemeName, Palette> = {
  light: {
    bg: '#F4EEE3',
    surface: '#FAF6EF',
    surfaceSunk: '#EDE5D7',
    hairline: '#DED3C1',
    ink: '#1C1915',
    inkSoft: '#5B5348',
    inkFaint: '#7F7568',
    accent: '#9C5313',
    accentInk: '#FFF8EE',
    glow: 'rgba(214, 138, 52, 0.18)',
    underline: '#B5641D',
    danger: '#A63A2B',
    success: '#4F6B3A',
    scrim: 'rgba(28, 25, 21, 0.40)',
  },
  dark: {
    bg: '#100E0B',
    surface: '#1A1714',
    surfaceSunk: '#0B0A08',
    hairline: '#2C2721',
    ink: '#EEE6D8',
    inkSoft: '#B5AB9B',
    inkFaint: '#8A8174',
    accent: '#E59B47',
    accentInk: '#1A1209',
    glow: 'rgba(229, 155, 71, 0.16)',
    underline: '#F0AE5E',
    danger: '#E07A66',
    success: '#9DBA7E',
    scrim: 'rgba(0, 0, 0, 0.55)',
  },
};

export interface ReaderTheme {
  name: ReaderThemeName;
  bg: string;
  ink: string;
  inkSoft: string;
  glow: string;
  underline: string;
  /** Which app palette the reader chrome should use on top of this page. */
  chrome: ThemeName;
}

export type ReaderThemeName = 'paper' | 'sepia' | 'dusk' | 'night';

export const readerThemes: Record<ReaderThemeName, ReaderTheme> = {
  paper: {
    name: 'paper',
    bg: '#F4EEE3',
    ink: '#1C1915',
    inkSoft: '#5B5348',
    glow: 'rgba(214, 138, 52, 0.18)',
    underline: '#B5641D',
    chrome: 'light',
  },
  sepia: {
    name: 'sepia',
    bg: '#EBDDC3',
    ink: '#2E2416',
    inkSoft: '#5F5038',
    glow: 'rgba(196, 118, 36, 0.20)',
    underline: '#A9601A',
    chrome: 'light',
  },
  dusk: {
    name: 'dusk',
    bg: '#2A2622',
    ink: '#E4D9C6',
    inkSoft: '#B3A894',
    glow: 'rgba(229, 155, 71, 0.18)',
    underline: '#EBA554',
    chrome: 'dark',
  },
  night: {
    name: 'night',
    bg: '#100E0B',
    ink: '#D9CFBF',
    inkSoft: '#A39886',
    glow: 'rgba(229, 155, 71, 0.16)',
    underline: '#F0AE5E',
    chrome: 'dark',
  },
};

/** Generated-cover palettes: background, ink, rule. Muted book-cloth colours, never neon. */
export const coverPalettes: readonly (readonly [string, string, string])[] = [
  ['#2F3A33', '#EFE6D2', '#C9A35B'],
  ['#5B2E2A', '#F3E7D8', '#D9A066'],
  ['#1F2D3D', '#EDE4D3', '#B98B4E'],
  ['#3E3427', '#F1E5CF', '#D19A49'],
  ['#E9DFCB', '#2A241C', '#9A5B1E'],
  ['#4A4E3B', '#F2EADA', '#CFA65C'],
  ['#6B4A2E', '#FBF4E8', '#E7B56E'],
  ['#2B2B33', '#ECE5D8', '#C08A4A'],
  ['#D9C9AA', '#2C2318', '#8E4F17'],
  ['#3B2F3F', '#F1E6DA', '#CC9A5E'],
  ['#24332E', '#E8E0CC', '#BE9455'],
  ['#7A3F2A', '#F8EDDD', '#EFC07E'],
];
