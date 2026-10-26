'use client';

import { useMemo, useState } from 'react';
import { play, stop } from '../../lib/clip';
import d from './demos.module.css';
import s from './PronunciationDemo.module.css';

/** The pronunciation dictionary: the same sentence before and after three rules. */
export function PronunciationDemo({
  text,
  rules,
  before,
  after,
}: {
  text: string;
  rules: { match: string; sayAs: string }[];
  before: string;
  after: string;
}) {
  const [now, setNow] = useState<'before' | 'after' | null>(null);
  const listener = useMemo(() => ({ onEnd: () => setNow(null), onStop: () => setNow(null) }), []);
  const hear = async (which: 'before' | 'after') => {
    if (now === which) return stop(listener);
    if (await play(which === 'before' ? before : after, listener)) setNow(which);
  };
  return (
    <div className={d.panel}>
      <p className={`${d.reading} ${s.text}`}>{text}</p>
      <table className={s.rules}>
        <caption className="visually-hidden">Your pronunciation rules</caption>
        <thead>
          <tr>
            <th scope="col">When the text says</th>
            <th scope="col">Say it as</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.match}>
              <td>{r.match}</td>
              <td>{r.sayAs}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={d.row}>
        <button
          type="button"
          className={d.chip}
          aria-pressed={now === 'before'}
          onClick={() => void hear('before')}
        >
          ▶ Without the rules
        </button>
        <button
          type="button"
          className={d.chip}
          aria-pressed={now === 'after'}
          onClick={() => void hear('after')}
        >
          ▶ With the rules
        </button>
      </div>
    </div>
  );
}
