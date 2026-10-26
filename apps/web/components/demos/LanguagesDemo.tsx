'use client';

import { useMemo, useState } from 'react';
import { play, stop } from '../../lib/clip';
import d from './demos.module.css';
import s from './LanguagesDemo.module.css';

/** All 31 voice languages: touch one to hear the same evening greeting in it. */
export function LanguagesDemo({
  languages,
}: {
  languages: { code: string; name: string; text: string; audio: string }[];
}) {
  const [now, setNow] = useState<string | null>(null);
  const [shown, setShown] = useState(languages[0]?.code ?? 'en');
  const listener = useMemo(() => ({ onEnd: () => setNow(null), onStop: () => setNow(null) }), []);
  const current = languages.find((l) => l.code === shown);
  return (
    <div className={s.wrap}>
      <ul className={s.grid}>
        {languages.map((l) => (
          <li key={l.code}>
            <button
              type="button"
              className={s.lang}
              aria-pressed={now === l.code}
              lang={l.code}
              onClick={async () => {
                setShown(l.code);
                if (now === l.code) return stop(listener);
                if (await play(l.audio, listener)) setNow(l.code);
              }}
            >
              {l.name}
            </button>
          </li>
        ))}
      </ul>
      <p
        className={`${d.reading} ${s.line}`}
        lang={current?.code}
        dir={current?.code === 'ar' ? 'rtl' : 'ltr'}
        aria-live="polite"
      >
        {current?.text}
      </p>
    </div>
  );
}
