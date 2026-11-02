import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The privacy policy says Lamplight does not connect to the internet, and release builds have no internet
// permission. These checks keep that true: a network call or the permission coming back fails the build.

const root = join(__dirname, '..');

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'build' || name === 'test' ? [] : files(p, ext);
    return ext.test(name) ? [p] : [];
  });
}

const NETWORK_JS =
  /\bfetch\s*\(|XMLHttpRequest|new WebSocket\b|EventSource\b|downloadAsync|downloadFileAsync|createDownloadResumable/;
const NETWORK_KT = /HttpURLConnection|openConnection\s*\(|\bokhttp3\b|java\.net\.Socket\b|\bURL\s*\(\s*"http/;

describe('no network', () => {
  it('app code makes no network requests', () => {
    const hits = files(join(root, 'src'), /\.tsx?$/).filter((f) => NETWORK_JS.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('the engine makes no network requests', () => {
    const src = join(root, 'modules/lamplight-engine/android/src/main');
    const hits = files(src, /\.kt$/).filter((f) => NETWORK_KT.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('release builds block the internet permission', () => {
    const config = readFileSync(join(root, 'app.config.ts'), 'utf8');
    const blocked = config.slice(config.indexOf('blockedPermissions'));
    expect(blocked).toContain("'android.permission.INTERNET'");
    expect(config).toContain('allowBackup: false');
  });
});
