// Re-renders only the word meanings in apps/web/demos/demos.json (the dictionary or explain() changed),
// leaving every other demo as web-demos.mts wrote it. No voices needed.
// Usage: node --import tsx tooling/scripts/web-meanings.mts <lexicon.db>, then prettier --write on demos.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderMeanings } from './lib/meanings.mts';

const [lexiconPath] = process.argv.slice(2);
if (!lexiconPath) {
  console.error('usage: web-meanings.mts <lexicon.db>');
  process.exit(2);
}
const file = join(new URL('../../', import.meta.url).pathname, 'apps/web/demos/demos.json');
const demos = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
demos.meanings = renderMeanings(lexiconPath);
writeFileSync(file, `${JSON.stringify(demos, null, 2)}\n`);
console.log('meanings written');
