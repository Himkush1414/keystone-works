// Prints the Clean Read eval: `node --import tsx/esm test/clean-report.ts [path/to/core/src/index.ts]`.
import { formatScore, scoreBook, type CleanCore } from './cleanEval';
import { messyBooks } from './fixtures/messyPdf';

const target = process.argv[2] ?? '../src/index.ts';
const core = (await import(target.startsWith('/') ? `file://${target}` : target)) as unknown as CleanCore;
for (const book of messyBooks()) process.stdout.write(`${formatScore(scoreBook(core, book))}\n`);
