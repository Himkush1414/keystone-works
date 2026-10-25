#!/usr/bin/env node
// Applies French typographic spacing to a catalog source file, in place and idempotently:
//   narrow no-break space (U+202F) before ; ! ?   and   no-break space (U+00A0) before : and inside « ».
// Spaces are written as \u escapes so the source stays free of invisible characters.
// Usage: node tooling/scripts/french-spacing.mjs apps/mobile/src/i18n/catalogs/fr.ts
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('usage: french-spacing.mjs <file>');
  process.exit(2);
}

const NNBSP = '\\u202f';
const NBSP = '\\u00a0';

/** Fixes the spacing inside one single-quoted string literal's content. */
// A space already there may be written as an escape or as the character itself; both count.
const SP = String.raw`(?:\\u00a0|\\u202f|[ \u00a0\u202f])`;
const BEFORE_MARK = new RegExp(`${SP}*([;!?])`, 'g');
const BEFORE_COLON = new RegExp(`${SP}+:(?!//)`, 'g');
const AFTER_OPEN = new RegExp(`«${SP}*`, 'g');
const BEFORE_CLOSE = new RegExp(`${SP}*»`, 'g');

export function frenchSpacing(s) {
  return s
    .replace(BEFORE_MARK, (m, p, offset) => (offset === 0 ? m : `${NNBSP}${p}`))
    .replace(BEFORE_COLON, `${NBSP}:`)
    .replace(AFTER_OPEN, `«${NBSP}`)
    .replace(BEFORE_CLOSE, `${NBSP}»`);
}

const src = readFileSync(file, 'utf8');
let changed = 0;
const out = src.replace(/'((?:[^'\\\n]|\\.)*)'/g, (whole, body) => {
  // Only touch prose: skip import paths, object keys used as identifiers and placeholders-only strings.
  if (!/\s/.test(body) && !/[;:!?«»]/.test(body)) return whole;
  const fixed = frenchSpacing(body);
  if (fixed !== body) changed++;
  return `'${fixed}'`;
});
writeFileSync(file, out);
console.log(`french-spacing: ${changed} string(s) updated in ${file}`);
