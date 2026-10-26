import { palettes } from '@lamplight/tokens';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** The app's Night palette as a class, for parts of the page that are night whatever the visitor's theme. */
export function nightClass(): string {
  const vars = Object.entries(palettes.dark)
    .map(([k, v]) => `--color-${kebab(k)}: ${v};`)
    .join(' ');
  return `.night { ${vars} color-scheme: dark; background: var(--color-bg); color: var(--color-ink); }`;
}
