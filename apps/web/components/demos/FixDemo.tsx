'use client';

import { useMemo, useState } from 'react';
import { play, stop } from '../../lib/clip';
import d from './demos.module.css';
import s from './FixDemo.module.css';

/** "Who says this?": tap the speaker's name, choose who it really is, and hear the line in their voice. */
export function FixDemo({
  line,
  options,
}: {
  line: string;
  options: { speaker: string; voice: string; audio: string }[];
}) {
  // Starts on a wrong guess, as Cast sometimes makes one.
  const [who, setWho] = useState(0);
  const [open, setOpen] = useState(false);
  const [fixed, setFixed] = useState(false);
  const listener = useMemo(() => ({}), []);
  const pick = (i: number) => {
    setWho(i);
    setOpen(false);
    setFixed(i !== 0);
    const o = options[i];
    if (o) void play(o.audio, listener);
  };
  const current = options[who];
  return (
    <div className={d.phone}>
      <div className={d.screen} style={{ minHeight: 360 }}>
        <div className={d.bar}>
          <span>Alice in Wonderland</span>
          <span className={d.faint}>A Mad Tea-Party</span>
        </div>
        <div className={`${d.reading} ${s.page}`}>
          <p className={d.muted}>“No room! No room!” they cried out when they saw Alice coming.</p>
          <p>
            <button
              type="button"
              className={s.name}
              style={{ color: `var(--label-${who})` }}
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              aria-label={`Speaker: ${current?.speaker}. Change who says this`}
            >
              {current?.speaker}
            </button>
            <span className={`${d.sentence} ${d.now}`}>“{line}”</span>
          </p>
          <p className={`${d.small} ${fixed ? s.done : d.faint}`} aria-live="polite">
            {fixed
              ? `Fixed. Lamplight remembers it for this book, and the lines after it follow.`
              : 'Cast guessed Alice. Tap the name to correct it.'}
          </p>
        </div>
        <div
          className={d.sheet}
          data-open={open}
          aria-hidden={!open}
          role="dialog"
          aria-label="Who says this?"
        >
          <div className={d.grip} />
          <p className={s.title}>Who says this?</p>
          <div role="radiogroup">
            {options.map((o, i) => (
              <button
                key={o.speaker}
                type="button"
                role="radio"
                aria-checked={who === i}
                className={d.option}
                tabIndex={open ? 0 : -1}
                onClick={() => pick(i)}
              >
                <span className={d.dot} style={{ background: `var(--label-${i})` }} />
                {o.speaker}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`${d.chip} ${s.close}`}
            tabIndex={open ? 0 : -1}
            onClick={() => (setOpen(false), stop(listener))}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
