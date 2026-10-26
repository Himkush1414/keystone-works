'use client';

import { useMemo, useState } from 'react';
import { play, stop } from '../../lib/clip';
import { PlaneIcon } from './icons';
import d from './demos.module.css';
import s from './PrivacyDemo.module.css';

/** Private by design: switch on airplane mode, and it still reads. */
export function PrivacyDemo({ audio }: { audio: string }) {
  const [plane, setPlane] = useState(false);
  const [on, setOn] = useState(false);
  const listener = useMemo(() => ({ onEnd: () => setOn(false), onStop: () => setOn(false) }), []);
  return (
    <div className={d.phone}>
      <div className={`${d.screen} ${s.screen}`} data-plane={plane}>
        <div className={s.status}>
          <span>9:41</span>
          <span className={s.icons} aria-hidden="true">
            {plane ? <PlaneIcon /> : <span className={s.bars}>▂▄▆█</span>}
          </span>
        </div>
        <button
          type="button"
          className={s.toggle}
          role="switch"
          aria-checked={plane}
          onClick={() => setPlane(!plane)}
        >
          <PlaneIcon />
          <span>Airplane mode</span>
          <span className={s.knob} aria-hidden="true" />
        </button>
        <div className={s.card}>
          <p className={s.big}>{plane ? 'Still reading.' : 'Reading.'}</p>
          <p className={`${d.small} ${d.muted}`}>
            {plane
              ? 'No connection, and nothing changes: the voices are on the phone.'
              : 'Turn airplane mode on, then press play.'}
          </p>
          <button
            type="button"
            className={d.chip}
            aria-pressed={on}
            onClick={async () => (on ? stop(listener) : setOn(await play(audio, listener)))}
          >
            {on ? '❚❚ Pause' : '▶ Play'}
          </button>
        </div>
        <ul className={s.never}>
          <li>No account</li>
          <li>No analytics</li>
          <li>No ads</li>
          <li>Nothing you read is uploaded</li>
        </ul>
      </div>
    </div>
  );
}
