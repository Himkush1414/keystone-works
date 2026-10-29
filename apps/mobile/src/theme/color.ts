/** True when text on `hex` (#rgb or #rrggbb) should be light: its relative luminance is under 0.4. */
export function isDarkColor(hex: string): boolean {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6);
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return false;
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  return l < 0.4;
}

/** `from` moved `amount` (0–1) of the way to `to`, both #rgb or #rrggbb; `from` unchanged if either won't parse. */
export function mixColor(from: string, to: string, amount: number): string {
  const rgb = (hex: string) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6);
    const n = Number.parseInt(full, 16);
    return full.length === 6 && Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : null;
  };
  const a = rgb(from);
  const b = rgb(to);
  if (!a || !b) return from;
  const t = Math.min(1, Math.max(0, amount));
  return `#${a
    .map((v, k) =>
      Math.round(v + ((b[k] ?? v) - v) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
