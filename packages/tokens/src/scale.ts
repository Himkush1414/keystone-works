/** Space, radius, type and motion scales shared by the app and the website. */

export const space = {
  hair: 2,
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  x3: 40,
  x4: 56,
  x5: 72,
} as const;

export const radius = {
  cover: 3,
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const fonts = {
  display: 'Fraunces',
  ui: 'AtkinsonHyperlegibleNext',
  reader: 'Literata',
  dyslexic: 'OpenDyslexic',
} as const;

export interface TypeStyle {
  family: keyof typeof fonts;
  size: number;
  lineHeight: number;
  weight: 400 | 500 | 600 | 700;
  tracking?: number;
  smallCaps?: boolean;
}

export const type = {
  display: { family: 'display', size: 34, lineHeight: 40, weight: 600, tracking: -0.3 },
  title1: { family: 'display', size: 26, lineHeight: 32, weight: 600, tracking: -0.2 },
  title2: { family: 'ui', size: 20, lineHeight: 26, weight: 700 },
  body: { family: 'ui', size: 16, lineHeight: 24, weight: 400 },
  bodyStrong: { family: 'ui', size: 16, lineHeight: 24, weight: 700 },
  callout: { family: 'ui', size: 15, lineHeight: 21, weight: 400 },
  meta: { family: 'ui', size: 13, lineHeight: 18, weight: 400, tracking: 0.2 },
  micro: { family: 'ui', size: 11, lineHeight: 14, weight: 700, tracking: 0.6, smallCaps: true },
} as const satisfies Record<string, TypeStyle>;

export type TypeVariant = keyof typeof type;

/** Reader typography bounds (sp). */
export const reader = {
  defaultSize: 19,
  minSize: 14,
  maxSize: 32,
  defaultLineHeight: 1.58,
  minLineHeight: 1.35,
  maxLineHeight: 1.9,
  maxMeasureCh: 68,
} as const;

export interface SpringConfig {
  damping: number;
  stiffness: number;
  mass: number;
}

export const motion = {
  spring: {
    snappy: { damping: 22, stiffness: 320, mass: 1 },
    gentle: { damping: 26, stiffness: 180, mass: 1 },
    underline: { damping: 30, stiffness: 260, mass: 0.6 },
    breath: { damping: 12, stiffness: 90, mass: 1 },
  } satisfies Record<string, SpringConfig>,
  easing: {
    out: [0.22, 1, 0.36, 1],
    in: [0.64, 0, 0.78, 0],
  } as const,
  duration: {
    micro: 120,
    short: 200,
    medium: 280,
    long: 420,
  },
} as const;

export const touch = {
  minTarget: 48,
  glyph: 24,
} as const;
