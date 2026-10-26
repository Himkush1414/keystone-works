'use client';

import { useState, type CSSProperties } from 'react';
import { readerThemes, type ReaderThemeName } from '@lamplight/tokens';
import d from './demos.module.css';
import s from './ThemesDemo.module.css';

const FONTS = [
  { id: 'literata', label: 'Literata', family: 'var(--font-reader), Georgia, serif' },
  { id: 'atkinson', label: 'Atkinson Hyperlegible', family: 'var(--font-ui), sans-serif' },
  { id: 'dyslexic', label: 'OpenDyslexic', family: 'var(--font-dyslexic), sans-serif' },
] as const;
const SIZES = [
  { px: 17, label: 'Small' },
  { px: 19, label: 'Medium' },
  { px: 22, label: 'Large' },
  { px: 26, label: 'Larger' },
] as const;
const THEMES: ReaderThemeName[] = ['paper', 'sepia', 'dusk', 'night'];
const NAME: Record<ReaderThemeName, string> = {
  paper: 'Paper',
  sepia: 'Sepia',
  dusk: 'Dusk',
  night: 'Night',
};

/** Reading appearance: the app's four reading themes, three fonts and four sizes, on a real passage. */
export function ThemesDemo({ passage }: { passage: string }) {
  const [theme, setTheme] = useState<ReaderThemeName>('sepia');
  const [font, setFont] = useState<(typeof FONTS)[number]['id']>('literata');
  const [size, setSize] = useState(19);
  const t = readerThemes[theme];
  const style = {
    background: t.bg,
    color: t.ink,
    fontFamily: FONTS.find((f) => f.id === font)?.family,
    fontSize: size,
    '--glow': t.glow,
  } as CSSProperties;
  return (
    <div className={s.wrap}>
      <div className={s.page} style={style}>
        <p>
          <span className={s.glow}>{passage.split('. ')[0]}.</span> {passage.split('. ').slice(1).join('. ')}
        </p>
      </div>
      <div className={s.controls}>
        <div role="radiogroup" aria-label="Reading theme" className={d.row}>
          {THEMES.map((x) => (
            <button
              key={x}
              type="button"
              role="radio"
              aria-checked={theme === x}
              className={s.swatch}
              style={{ background: readerThemes[x].bg, color: readerThemes[x].ink }}
              onClick={() => setTheme(x)}
            >
              {NAME[x]}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Reading font" className={d.row}>
          {FONTS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={font === f.id}
              className={d.chip}
              style={{ fontFamily: f.family }}
              onClick={() => setFont(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Text size" className={d.row}>
          {SIZES.map((x) => (
            <button
              key={x.px}
              type="button"
              role="radio"
              aria-checked={size === x.px}
              className={d.chip}
              onClick={() => setSize(x.px)}
            >
              <span style={{ fontSize: Math.round(x.px * 0.75) }}>A</span>
              <span className="visually-hidden">{x.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
