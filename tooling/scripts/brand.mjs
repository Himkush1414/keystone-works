#!/usr/bin/env node
// Generates every Lamplight brand asset from code: the speaking-flame mark, the wordmark (Fraunces outlines),
// lockups, app icons (adaptive layers + monochrome), splash, notification icon, Play Store icon and feature
// graphic, favicons and the social preview image.
// Usage: node tooling/scripts/brand.mjs <fonts-dir> <out-dir>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import opentype from 'opentype.js';
import { Resvg } from '@resvg/resvg-js';

const [fontsDir, out] = process.argv.slice(2);
if (!fontsDir || !out) {
  console.error('usage: brand.mjs <fonts-dir> <out-dir>');
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const INK = '#100E0B';
const AMBER = '#E59B47';
const PAPER = '#EEE6D8';
const INK_LIGHT = '#1C1915';

// ── The mark: a lamp flame rising from an open book (the book is negative space), on a 100×100 grid. ──
const FLAME =
  'M56 3C52 15 63 23 71 33C79 43 82 53 80 65C78 81 66 95 50 95C34 95 20 83 20 66C20 51 29 40 37 31C45 22 53 15 56 3Z';
/** Two pages with a narrow spine gap; top edges rise toward the outer corners like an open book. */
function book(gap, top, bottom, edge) {
  const page = (dir) => {
    const inner = 50 + dir * gap;
    const outer = dir < 0 ? edge : 100 - edge;
    const c1 = 50 + dir * (6 + gap);
    const c2 = 50 + dir * 14;
    return `M${inner} ${top}C${c1} ${top - 4.5} ${c2} ${top - 5} ${outer} ${top - 3}V${bottom - 3.5}C${c2} ${bottom - 5} ${c1} ${bottom - 4} ${inner} ${bottom + 0.5}Z`;
  };
  return page(-1) + page(1);
}
const MARK_PATH = FLAME + book(1.4, 65, 81, 31.5);
/** Vertical extent of the flame on the grid, used to centre it optically. */
const MARK_TOP = 3;
const MARK_BOTTOM = 95;

const markSvg = (fill, size = 100) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><path fill="${fill}" fill-rule="evenodd" d="${MARK_PATH}"/></svg>`;

/** The mark placed in a square canvas: `scale` = flame height as a fraction of the canvas. */
function markAt(canvas, scale, fill, dy = 0) {
  const s = (canvas * scale) / (MARK_BOTTOM - MARK_TOP);
  const tx = canvas / 2 - 50 * s;
  const ty = canvas / 2 - ((MARK_TOP + MARK_BOTTOM) / 2) * s + dy * canvas;
  return `<path transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})" fill="${fill}" fill-rule="evenodd" d="${MARK_PATH}"/>`;
}

const glow = (id, cx, cy, r, opacity) =>
  `<defs><radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${AMBER}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${AMBER}" stop-opacity="0"/></radialGradient></defs>`;

// ── Type as outlines, so the assets don't depend on installed fonts. ──
const font = (file) => {
  const b = readFileSync(join(fontsDir, file));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const fraunces = font('Fraunces-Display.ttf');
const atkinson = font('AtkinsonHyperlegibleNext-Regular.ttf');

/** Path data for `text` at `size`, baseline at (x, y), with kerning and extra tracking (em fraction). */
function textPath(f, text, x, y, size, tracking = 0) {
  const glyphs = f.stringToGlyphs(text);
  const scale = size / f.unitsPerEm;
  let cursor = x;
  const parts = [];
  glyphs.forEach((g, i) => {
    // Outlines are drawn at the origin and placed with a transform: opentype.js emits NaN for some
    // coordinates when a glyph is drawn at a fractional x offset.
    parts.push({ d: g.getPath(0, 0, size).toPathData(2), x: Math.round(cursor * 1000) / 1000 });
    const next = glyphs[i + 1];
    const kern = next ? f.getKerningValue(g, next) : 0;
    cursor += ((g.advanceWidth ?? 0) + kern) * scale + tracking * size;
  });
  // One <path> per glyph: resvg mis-parses some glyph runs when every outline shares one path element.
  return { d: parts, y, width: cursor - x - tracking * size };
}

const word = textPath(fraunces, 'Lamplight', 0, 0, 100, -0.01);
const wordBox = { width: word.width, ascent: 72, descent: 26 };
/** Glyph outlines as SVG path elements, optionally transformed. */
const glyphs = (t, fill, transform = '', extra = '') =>
  `<g${transform ? ` transform="${transform}"` : ''} fill="${fill}"${extra}>${t.d.map((p) => `<path transform="translate(${p.x} ${t.y})" d="${p.d}"/>`).join('')}</g>`;

const wordmarkSvg = (fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(wordBox.width)}" height="${wordBox.ascent + wordBox.descent}" viewBox="0 ${-wordBox.ascent} ${Math.ceil(wordBox.width)} ${wordBox.ascent + wordBox.descent}">${glyphs(word, fill)}</svg>`;

function lockupSvg(markFill, textFill) {
  const h = 120;
  const markSize = 120;
  const gap = 18;
  const textScale = 0.62;
  const w = markSize + gap + wordBox.width * textScale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w)}" height="${h}" viewBox="0 0 ${Math.ceil(w)} ${h}">${markAt(markSize, 0.82, markFill).replace('<path', '<path')}${glyphs(word, textFill, `translate(${markSize + gap} ${h / 2 + 22}) scale(${textScale})`)}</svg>`;
}

// ── Icons ──
const ICON = 1024;
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON}" height="${ICON}" viewBox="0 0 ${ICON} ${ICON}">${glow('g', ICON / 2, ICON * 0.55, ICON * 0.48, 0.22)}<rect width="${ICON}" height="${ICON}" fill="${INK}"/><rect width="${ICON}" height="${ICON}" fill="url(#g)"/>${markAt(ICON, 0.56, AMBER, 0.01)}</svg>`;
// Adaptive icons: 108dp canvas, 66dp safe zone → keep the flame within ~48% of the canvas.
const adaptiveFg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON}" height="${ICON}" viewBox="0 0 ${ICON} ${ICON}">${markAt(ICON, 0.46, AMBER, 0.008)}</svg>`;
const adaptiveBg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON}" height="${ICON}" viewBox="0 0 ${ICON} ${ICON}">${glow('g', ICON / 2, ICON * 0.53, ICON * 0.42, 0.2)}<rect width="${ICON}" height="${ICON}" fill="${INK}"/><rect width="${ICON}" height="${ICON}" fill="url(#g)"/></svg>`;
const adaptiveMono = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON}" height="${ICON}" viewBox="0 0 ${ICON} ${ICON}">${markAt(ICON, 0.46, '#FFFFFF', 0.008)}</svg>`;
const splashIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON}" height="${ICON}" viewBox="0 0 ${ICON} ${ICON}">${markAt(ICON, 0.62, AMBER)}</svg>`;
const notification = (s) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${markAt(s, 0.86, '#FFFFFF')}</svg>`;

// ── Store and web graphics ──
function featureGraphic() {
  const W = 1024;
  const H = 500;
  const tagline = textPath(atkinson, 'Light to read by. A voice to listen to.', 0, 0, 30, 0.005);
  const mark = 230;
  const textX = 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${glow('g', 215, 250, 330, 0.26)}<rect width="${W}" height="${H}" fill="${INK}"/><rect width="${W}" height="${H}" fill="url(#g)"/><g transform="translate(${215 - mark / 2} ${250 - mark / 2})">${markAt(mark, 0.9, AMBER)}</g>${glyphs(word, PAPER, `translate(${textX} 262) scale(1.02)`)}${glyphs(tagline, PAPER, `translate(${textX + 4} 318)`, ' fill-opacity="0.72"')}</svg>`;
}

function ogImage() {
  const W = 1200;
  const H = 630;
  const tagline = textPath(
    atkinson,
    'Books, PDFs and articles read aloud. Offline. Yours for good.',
    0,
    0,
    32,
    0.004,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${glow('g', 600, 230, 420, 0.24)}<rect width="${W}" height="${H}" fill="${INK}"/><rect width="${W}" height="${H}" fill="url(#g)"/><g transform="translate(${600 - 110} 70)">${markAt(220, 0.9, AMBER)}</g>${glyphs(word, PAPER, `translate(${600 - (wordBox.width * 1.1) / 2} 430) scale(1.1)`)}${glyphs(tagline, PAPER, `translate(${600 - tagline.width / 2} 505)`, ' fill-opacity="0.7"')}</svg>`;
}

const png = (svg, width) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: width }, background: 'rgba(0,0,0,0)' }).render().asPng();
const files = {
  'mark.svg': markSvg(AMBER),
  'mark-ink.svg': markSvg(INK_LIGHT),
  'mark-mono.svg': markSvg('#FFFFFF'),
  'wordmark-ink.svg': wordmarkSvg(INK_LIGHT),
  'wordmark-paper.svg': wordmarkSvg(PAPER),
  'lockup-light.svg': lockupSvg('#9C5313', INK_LIGHT),
  'lockup-dark.svg': lockupSvg(AMBER, PAPER),
  'icon.svg': iconSvg,
};
for (const [name, svg] of Object.entries(files)) writeFileSync(join(out, name), svg);

const rasters = {
  'icon.png': [iconSvg, 1024],
  'adaptive-foreground.png': [adaptiveFg, 1024],
  'adaptive-background.png': [adaptiveBg, 1024],
  'adaptive-monochrome.png': [adaptiveMono, 1024],
  'splash-icon.png': [splashIcon, 1024],
  'notification-icon.png': [notification(96), 96],
  'play-store-icon.png': [iconSvg, 512],
  'feature-graphic.png': [featureGraphic(), 1024],
  'favicon-32.png': [iconSvg, 32],
  'favicon-192.png': [iconSvg, 192],
  'apple-touch-icon.png': [iconSvg, 180],
  'og-image.png': [ogImage(), 1200],
};
for (const [name, [svg, width]] of Object.entries(rasters)) {
  const data = png(svg, width);
  writeFileSync(join(out, name), data);
  console.log(`${name.padEnd(28)} ${width}px  ${(data.length / 1024).toFixed(0)} KB`);
}
