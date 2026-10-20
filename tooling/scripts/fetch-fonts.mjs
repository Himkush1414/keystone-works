#!/usr/bin/env node
// Downloads Lamplight's typefaces as static TTF instances (all SIL Open Font License 1.1) with their licences.
// Usage: node tooling/scripts/fetch-fonts.mjs <out-dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
if (!out) {
  console.error('usage: fetch-fonts.mjs <out-dir>');
  process.exit(2);
}
// An old Android user agent makes the Google Fonts CSS API answer with single static TrueType files.
const UA =
  'Mozilla/5.0 (Linux; U; Android 2.2; en-us; Nexus One Build/FRF91) AppleWebKit/533.1 (KHTML, like Gecko)';

/** [output file, CSS2 family spec] */
const FONTS = [
  ['Fraunces-SemiBold.ttf', 'Fraunces:opsz,wght,SOFT@72,600,50'],
  ['Fraunces-Display.ttf', 'Fraunces:opsz,wght,SOFT@144,600,100'],
  ['Fraunces-Italic.ttf', 'Fraunces:ital,opsz,wght,SOFT@1,72,400,50'],
  ['AtkinsonHyperlegibleNext-Regular.ttf', 'Atkinson+Hyperlegible+Next:wght@400'],
  ['AtkinsonHyperlegibleNext-Medium.ttf', 'Atkinson+Hyperlegible+Next:wght@500'],
  ['AtkinsonHyperlegibleNext-Bold.ttf', 'Atkinson+Hyperlegible+Next:wght@700'],
  ['AtkinsonHyperlegibleNext-Italic.ttf', 'Atkinson+Hyperlegible+Next:ital,wght@1,400'],
  ['Literata-Regular.ttf', 'Literata:opsz,wght@18,400'],
  ['Literata-Italic.ttf', 'Literata:ital,opsz,wght@1,18,400'],
  ['Literata-Bold.ttf', 'Literata:opsz,wght@18,700'],
];
const LICENCES = {
  Fraunces: 'https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/OFL.txt',
  AtkinsonHyperlegibleNext:
    'https://raw.githubusercontent.com/google/fonts/main/ofl/atkinsonhyperlegiblenext/OFL.txt',
  Literata: 'https://raw.githubusercontent.com/google/fonts/main/ofl/literata/OFL.txt',
  OpenDyslexic: 'https://raw.githubusercontent.com/antijingoist/opendyslexic/master/OFL.txt',
};
const OPEN_DYSLEXIC = {
  'OpenDyslexic-Regular.otf':
    'https://raw.githubusercontent.com/antijingoist/opendyslexic/master/compiled/OpenDyslexic-Regular.otf',
  'OpenDyslexic-Bold.otf':
    'https://raw.githubusercontent.com/antijingoist/opendyslexic/master/compiled/OpenDyslexic-Bold.otf',
};

async function get(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

mkdirSync(out, { recursive: true });
for (const [file, family] of FONTS) {
  const css = (
    await get(`https://fonts.googleapis.com/css2?family=${family}&display=swap`, {
      headers: { 'User-Agent': UA },
    })
  ).toString();
  const urls = [...css.matchAll(/url\((https:[^)]+\.ttf)\)/g)].map((m) => m[1]);
  if (urls.length !== 1) throw new Error(`${file}: expected one TTF, got ${urls.length}`);
  const data = await get(urls[0]);
  writeFileSync(join(out, file), data);
  console.log(`${file.padEnd(40)} ${(data.length / 1024).toFixed(0)} KB`);
}
for (const [file, url] of Object.entries(OPEN_DYSLEXIC)) {
  const data = await get(url);
  writeFileSync(join(out, file), data);
  console.log(`${file.padEnd(40)} ${(data.length / 1024).toFixed(0)} KB`);
}
for (const [name, url] of Object.entries(LICENCES)) {
  writeFileSync(join(out, `OFL-${name}.txt`), await get(url));
}
console.log('licences written');
