'use client';

import { useMemo, useState } from 'react';
import { play, stop } from '../../lib/clip';
import { PlayPause } from './icons';
import d from './demos.module.css';
import s from './CleanReadDemo.module.css';

/** Clean Read: a journal page read with it off (every header and number) and on (just the writing). */
export function CleanReadDemo({
  on: onRun,
  off: offRun,
}: {
  on: { audio: string; spoken: string[] };
  off: { audio: string; spoken: string[] };
}) {
  const [clean, setClean] = useState(true);
  const [playing, setPlaying] = useState(false);
  const listener = useMemo(() => ({ onEnd: () => setPlaying(false), onStop: () => setPlaying(false) }), []);
  const run = clean ? onRun : offRun;
  const toggle = async (next: boolean) => {
    setClean(next);
    if (playing) setPlaying(await play((next ? onRun : offRun).audio, listener));
  };
  return (
    <div className={s.wrap} data-clean={clean}>
      <figure className={s.page} aria-label="A journal page">
        <div className={`${s.skip} ${s.head}`}>JOURNAL OF EVERYDAY READING · VOL. 12</div>
        <p>
          Reading aloud changes how we remember a text.<sup className={s.skip}>14</sup> Listeners in the study
          recalled more of what they heard when the voice paused at the ends of sen
          <span className={s.hyphen}>-</span>
          <br className={s.break} />
          tences<span className={s.skip}> (Ortiz and Rao, 2019)</span>.
        </p>
        <div className={`${s.skip} ${s.folio}`}>37</div>
      </figure>
      <div className={d.panel}>
        <div className={d.row} role="radiogroup" aria-label="Clean Read">
          <button
            type="button"
            role="radio"
            aria-checked={!clean}
            className={d.chip}
            onClick={() => void toggle(false)}
          >
            Clean Read off
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={clean}
            className={d.chip}
            onClick={() => void toggle(true)}
          >
            Clean Read on
          </button>
          <PlayPause
            className={d.round}
            playing={playing}
            label="the page"
            onClick={async () => (playing ? stop(listener) : setPlaying(await play(run.audio, listener)))}
          />
        </div>
        <p className={`${d.small} ${s.heard}`}>
          <span className={d.faint}>What you hear: </span>“{run.spoken.join(' ').slice(0, 230)}…”
        </p>
      </div>
    </div>
  );
}
