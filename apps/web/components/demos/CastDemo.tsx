'use client';

import { useMemo, useState } from 'react';
import { play, stop } from '../../lib/clip';
import { PlayPause } from './icons';
import d from './demos.module.css';
import s from './CastDemo.module.css';

export interface CastLine {
  text: string;
  start: number;
  end: number;
  speaker?: string;
  voice: string;
}
type Mode = 'off' | 'on' | 'yours';

const MODES: { id: Mode; label: string; note: string }[] = [
  { id: 'off', label: 'Cast off', note: 'One voice reads everything, quotes and all.' },
  { id: 'on', label: 'Cast', note: 'The narrator, and a voice for each character, chosen by Cast.' },
  { id: 'yours', label: 'Your voices', note: 'Pick any of the ten voices for any character.' },
];
/** The app's names for the ten voices (apps/mobile/src/i18n/catalogs/en.ts, voices.names). */
export const VOICE_NAMES: Record<string, string> = {
  F1: 'Nora',
  F2: 'Iris',
  F3: 'Clara',
  F4: 'Maren',
  F5: 'Lena',
  M1: 'Elias',
  M2: 'Theo',
  M3: 'Arlo',
  M4: 'Silas',
  M5: 'Jonah',
};

/** Cast: the same scene with one voice, with Cast's voices, and with voices the listener chose. */
export function CastDemo({ runs }: { runs: Record<Mode, { audio: string; lines: CastLine[] }> }) {
  const [mode, setMode] = useState<Mode>('on');
  const [ms, setMs] = useState(-1);
  const [on, setOn] = useState(false);
  const run = runs[mode];
  const listener = useMemo(
    () => ({ onTime: setMs, onEnd: () => (setOn(false), setMs(-1)), onStop: () => setOn(false) }),
    [],
  );
  const cast = useMemo(() => {
    const seen = new Map<string, string>();
    for (const l of run.lines) seen.set(l.speaker ?? 'Narrator', l.voice);
    return [...seen];
  }, [run]);
  const colour = (who: string | undefined) =>
    !who ? 'var(--color-ink-faint)' : `var(--label-${cast.findIndex(([n]) => n === who) % 4})`;

  const choose = async (m: Mode) => {
    setMode(m);
    if (on && (await play(runs[m].audio, listener, 0))) setOn(true);
  };

  return (
    <div className={d.panel}>
      <div className={s.modes} role="radiogroup" aria-label="Cast">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            className={d.chip}
            onClick={() => void choose(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className={`${d.small} ${d.muted}`}>{MODES.find((m) => m.id === mode)?.note}</p>
      <ul className={s.cast} aria-label="Who reads">
        {cast.map(([who, voice]) => (
          <li key={who}>
            <span
              className={d.dot}
              style={{ background: who === 'Narrator' ? 'var(--color-ink-faint)' : colour(who) }}
            />
            <span className={s.who}>{who}</span>
            <span className={d.faint}>{VOICE_NAMES[voice] ?? voice}</span>
          </li>
        ))}
      </ul>
      <div className={`${d.reading} ${s.scene}`}>
        {run.lines.map((l, i) => {
          const now = ms >= l.start && ms < (run.lines[i + 1]?.start ?? Infinity);
          return (
            <span key={i} className={now ? `${d.sentence} ${d.now}` : d.sentence}>
              {l.speaker && mode !== 'off' && (
                <span className={d.label} style={{ color: colour(l.speaker) }}>
                  {l.speaker}
                </span>
              )}
              {l.text}{' '}
            </span>
          );
        })}
      </div>
      <div className={s.foot}>
        <PlayPause
          className={d.round}
          playing={on}
          label="the scene"
          onClick={async () =>
            on ? stop(listener) : setOn(await play(run.audio, listener, Math.max(0, ms)))
          }
        />
        <span className={`${d.small} ${d.faint}`}>Pride and Prejudice, Chapter 1</span>
      </div>
    </div>
  );
}
