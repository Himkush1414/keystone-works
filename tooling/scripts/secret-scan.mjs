#!/usr/bin/env node
// Scans staged changes (or the paths given) for credentials. Exits 1 on any finding.
// Usage: node tooling/scripts/secret-scan.mjs            (staged diff)
//        node tooling/scripts/secret-scan.mjs --all      (every tracked file)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PATTERNS = [
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ['Supabase access token', /\bsbp_[a-f0-9]{30,}\b/],
  ['JWT (Supabase key?)', /\beyJhbGciOi[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
  ['Vercel token', /\bvcp_[A-Za-z0-9]{30,}\b/],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/],
  ['AWS key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
];
const FORBIDDEN_PATHS = [/^\.env(?!\.example$)/, /(^|\/)_private\//, /\.(jks|keystore|p12|p8|pem)$/, /google-services\.json$/, /service-account.*\.json$/];

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const all = process.argv.includes('--all');
const files = (all ? git('ls-files') : git('diff', '--cached', '--name-only', '--diff-filter=ACMR')).split('\n').filter(Boolean);

const findings = [];
for (const f of files) {
  if (FORBIDDEN_PATHS.some((re) => re.test(f))) findings.push(`${f}: forbidden path`);
  let text;
  try {
    text = all ? readFileSync(f, 'utf8') : git('show', `:${f}`);
  } catch {
    continue;
  }
  if (text.includes('\u0000')) continue; // binary
  text.split('\n').forEach((line, i) => {
    for (const [name, re] of PATTERNS) if (re.test(line)) findings.push(`${f}:${i + 1}: ${name}`);
  });
}
if (findings.length) {
  console.error(`secret-scan: ${findings.length} finding(s) — refusing.\n` + findings.join('\n'));
  process.exit(1);
}
console.log(`secret-scan: clean (${files.length} file${files.length === 1 ? '' : 's'})`);
