#!/usr/bin/env node
// Full local verification before a push: secret scan, typecheck, lint, tests, formatting.
import { spawnSync } from 'node:child_process';

const steps = [
  ['secret scan', 'node', ['tooling/scripts/secret-scan.mjs']],
  ['typecheck', 'npm', ['run', '-s', 'typecheck']],
  ['lint', 'npx', ['eslint', '.', '--max-warnings=0']],
  ['format', 'npx', ['prettier', '--check', '.', '--log-level', 'warn']],
  ['tests', 'npm', ['run', '-s', 'test']],
];
for (const [name, cmd, args] of steps) {
  const t = Date.now();
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`verify: ${name} failed`);
    process.exit(r.status ?? 1);
  }
  console.log(`verify: ${name} ok (${Date.now() - t} ms)`);
}
