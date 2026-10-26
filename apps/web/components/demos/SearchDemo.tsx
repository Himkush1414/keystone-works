'use client';

import { useMemo, useState } from 'react';
import { play, stop } from '../../lib/clip';
import d from './demos.module.css';
import s from './SearchDemo.module.css';

export interface Searchable {
  id: string;
  title: string;
  lang: string;
  audio: string;
  sentences: { text: string; start: number; end: number }[];
}

const QUERIES = ['Netherfield', 'room', 'wine', 'ईद', 'बेटा'];

/** Search across the library: every result is a sentence, and touching it plays from there. */
export function SearchDemo({ library }: { library: Searchable[] }) {
  const [q, setQ] = useState(QUERIES[0] ?? '');
  const [now, setNow] = useState<string | null>(null);
  const listener = useMemo(() => ({ onEnd: () => setNow(null), onStop: () => setNow(null) }), []);
  const results = useMemo(
    () =>
      library.flatMap((b) =>
        b.sentences
          .filter((x) => x.text.toLocaleLowerCase().includes(q.toLocaleLowerCase()))
          .map((x) => ({ book: b, ...x })),
      ),
    [library, q],
  );
  /** Plays one sentence of a sample: from its start, stopping at its end. */
  const hear = async (key: string, audio: string, start: number, end: number) => {
    if (now === key) return stop(listener);
    const one = {
      ...listener,
      onTime: (ms: number) => {
        if (ms >= end) stop(one);
      },
    };
    if (await play(audio, one, start)) setNow(key);
  };
  return (
    <div className={d.panel}>
      <div className={s.box} aria-hidden="true">
        <span className={s.lens}>⌕</span>
        <span>{q}</span>
        <span className={s.caret} />
      </div>
      <div className={d.row} role="radiogroup" aria-label="Search for">
        {QUERIES.map((x) => (
          <button
            key={x}
            type="button"
            role="radio"
            aria-checked={q === x}
            className={d.chip}
            onClick={() => setQ(x)}
          >
            {x}
          </button>
        ))}
      </div>
      <p className={`${d.small} ${d.faint}`} aria-live="polite">
        {results.length} {results.length === 1 ? 'sentence' : 'sentences'} in your library
      </p>
      <ul className={s.results}>
        {results.slice(0, 5).map((r) => {
          const key = `${r.book.id}:${r.start}`;
          const i = r.text.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());
          return (
            <li key={key}>
              <button
                type="button"
                className={s.result}
                aria-pressed={now === key}
                lang={r.book.lang}
                onClick={() => void hear(key, r.book.audio, r.start, r.end)}
              >
                <span className={s.book}>{r.book.title}</span>
                <span className={s.snippet}>
                  {r.text.slice(0, i)}
                  <mark>{r.text.slice(i, i + q.length)}</mark>
                  {r.text.slice(i + q.length)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
