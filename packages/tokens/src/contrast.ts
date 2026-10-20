/** WCAG 2.x relative luminance and contrast, with alpha compositing for rgba() tokens. */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(input: string): Rgba {
  const s = input.trim();
  const [, rgb = '', alpha] = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s) ?? [];
  if (rgb) {
    const v = parseInt(rgb, 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255, a: alpha ? parseInt(alpha, 16) / 255 : 1 };
  }
  const [, r = '', g = '', b = '', a] =
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s) ?? [];
  if (r) {
    return { r: +r, g: +g, b: +b, a: a === undefined ? 1 : +a };
  }
  throw new Error(`Unsupported colour: ${input}`);
}

/** Composite `top` over an opaque `bottom`. */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(c: Rgba): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** Contrast ratio of `fg` on `bg`; translucent colours are composited onto `base` (defaults to `bg`). */
export function contrast(fg: string, bg: string, base?: string): number {
  const baseC = parseColor(base ?? bg);
  const bgC = over(parseColor(bg), baseC);
  const fgC = over(parseColor(fg), bgC);
  const [hi, lo] = [luminance(fgC), luminance(bgC)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
