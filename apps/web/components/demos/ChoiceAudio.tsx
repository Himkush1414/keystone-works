'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { play, stop } from '../../lib/clip';
import d from './demos.module.css';

/**
 * A few renders of the same words to compare: choose one and it plays; choosing another while playing
 * switches at once. Used for emotion processing and the quality levels.
 */
export function ChoiceAudio({
  label,
  options,
  children,
}: {
  label: string;
  options: { id: string; title: string; note: string; audio: string }[];
  children?: ReactNode;
}) {
  const [chosen, setChosen] = useState(options[0]?.id ?? '');
  const [on, setOn] = useState(false);
  const listener = useMemo(() => ({ onEnd: () => setOn(false), onStop: () => setOn(false) }), []);
  const pick = async (id: string) => {
    if (on && chosen === id) return stop(listener);
    setChosen(id);
    const o = options.find((x) => x.id === id);
    if (o) setOn(await play(o.audio, listener));
  };
  return (
    <div className={d.panel}>
      {children}
      <div role="radiogroup" aria-label={label} style={{ display: 'grid', gap: 10 }}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={chosen === o.id}
            className={d.option}
            style={{ borderRadius: 14, padding: '12px 14px', border: '1px solid var(--color-hairline)' }}
            onClick={() => void pick(o.id)}
          >
            <span
              className={d.round}
              style={{ width: 40, height: 40, opacity: chosen === o.id ? 1 : 0.45 }}
              aria-hidden="true"
            >
              {on && chosen === o.id ? '❚❚' : '▶'}
            </span>
            <span style={{ display: 'grid', gap: 2 }}>
              <span>{o.title}</span>
              <span className={`${d.small} ${d.faint}`} style={{ fontWeight: 400 }}>
                {o.note}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
