import { palettes, type Palette } from './color';
import { radius, space } from './scale';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function block(p: Palette): string {
  return Object.entries(p)
    .map(([k, v]) => `  --color-${kebab(k)}: ${v};`)
    .join('\n');
}

/**
 * CSS custom properties for the website. Light is the default; dark applies with the system preference
 * unless the page opts into a theme with `data-theme`.
 */
export function cssVariables(): string {
  const scale = [
    ...Object.entries(space).map(([k, v]) => `  --space-${k}: ${v}px;`),
    ...Object.entries(radius).map(([k, v]) => `  --radius-${k}: ${v}px;`),
  ].join('\n');
  return [
    `:root {\n${block(palettes.light)}\n${scale}\n  color-scheme: light dark;\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme='light']) {\n${block(palettes.dark).replace(/^/gm, '  ')}\n  }\n}`,
    `:root[data-theme='dark'] {\n${block(palettes.dark)}\n}`,
  ].join('\n\n');
}
