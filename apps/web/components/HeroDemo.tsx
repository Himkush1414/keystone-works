'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { sentenceAt, speakerLabels, type TimedSentence } from '../lib/timeline';
import styles from './HeroDemo.module.css';

/**
 * A few lines of a real sample that light up as they're spoken. Sound only after the visitor presses play.
 * The page passes just these lines, so the sample library stays out of the landing page's script.
 */
export function HeroDemo({
  title,
  audio: src,
  shown,
}: {
  title: string;
  audio: string;
  shown: TimedSentence[];
}) {
  const labels = useMemo(() => speakerLabels(shown), [shown]);
  const stopAt = shown.at(-1)?.end ?? 0;
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [ms, setMs] = useState(-1);
  const current = ms < 0 ? -1 : sentenceAt(shown, ms);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const a = audio.current;
      if (a) {
        const t = a.currentTime * 1000;
        if (t >= stopAt) {
          a.pause();
          a.currentTime = 0;
          setMs(-1);
          return;
        }
        setMs(t);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, stopAt]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (playing) a.pause();
    else void a.play().catch(() => setPlaying(false));
  };

  return (
    <figure className={styles.card}>
      <div className={styles.chrome}>
        <span className={styles.book}>
          {title} <span className={styles.chapter}>· Chapter 1</span>
        </span>
      </div>
      <div className={styles.text}>
        {[...new Set(shown.map((s) => s.block))].map((block) => (
          <p key={block}>
            {shown
              .filter((s) => s.block === block)
              .map((s) => {
                const label = labels.get(s.index);
                return (
                  <span key={s.index}>
                    {label && (
                      <span className={styles.speaker} data-slot={label.slot}>
                        {label.name}
                      </span>
                    )}
                    <span
                      className={s.index === current ? `${styles.sentence} ${styles.now}` : styles.sentence}
                    >
                      {s.text}
                    </span>
                    {s.gap}
                  </span>
                );
              })}
          </p>
        ))}
      </div>
      <figcaption className={styles.bar}>
        <button
          type="button"
          className={styles.play}
          onClick={toggle}
          aria-label={playing ? 'Pause the sample' : 'Play the sample'}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path d="M8 5v14M16 5v14" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path
                d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"
                fill="currentColor"
              />
            </svg>
          )}
        </button>
        <span className={styles.caption}>
          {playing
            ? 'The narrator and Mrs. Bennet: two voices, cast by the app'
            : `Press play to listen · ${Math.round(stopAt / 1000)} seconds`}
        </span>
      </figcaption>
      <audio
        ref={audio}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
    </figure>
  );
}
