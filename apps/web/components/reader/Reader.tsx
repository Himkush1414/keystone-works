'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { readerThemes, type ReaderThemeName } from '@lamplight/tokens';
import { clock, LANGUAGE_NAMES } from '../../lib/format';
import type { Sample } from '../../lib/samples';
import { flatten, LABEL_COLORS, sentenceAt, speakerLabels } from '../../lib/timeline';
import { PlayButton } from '../PlayButton';
import styles from './Reader.module.css';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
const THEMES: ('auto' | ReaderThemeName)[] = ['auto', 'paper', 'sepia', 'dusk', 'night'];
const THEME_NAMES: Record<(typeof THEMES)[number], string> = {
  auto: 'Auto',
  paper: 'Paper',
  sepia: 'Sepia',
  dusk: 'Dusk',
  night: 'Night',
};
const THEME_KEY = 'lamplight.readerTheme';
const PACKAGE = 'app.lamplight.reader';

/** CSS variables for a chosen reader theme; "auto" leaves them to the stylesheet (paper by day, night after). */
function themeVars(name: (typeof THEMES)[number]): CSSProperties | undefined {
  if (name === 'auto') return undefined;
  const t = readerThemes[name];
  const vars: Record<string, string> = {
    '--paper-bg': t.bg,
    '--paper-ink': t.ink,
    '--paper-ink-soft': t.inkSoft,
    '--paper-glow': t.glow,
    '--paper-underline': t.underline,
  };
  LABEL_COLORS[t.chrome].forEach((c, i) => (vars[`--label-${i}`] = c));
  vars['--label-unknown'] = t.chrome === 'dark' ? '#A8A8A8' : '#606060';
  return vars as CSSProperties;
}

export function Reader({ sample }: { sample: Sample }) {
  const audio = useRef<HTMLAudioElement>(null);
  const sentenceEls = useRef<(HTMLSpanElement | null)[]>([]);
  const sentences = useMemo(() => flatten(sample), [sample]);
  const labels = useMemo(() => speakerLabels(sentences), [sentences]);
  /** Index of each paragraph's first sentence in reading order. */
  const firstOf = useMemo(() => {
    const out: number[] = [];
    let n = 0;
    for (const b of sample.blocks) {
      out.push(n);
      n += b.sentences.length;
    }
    return out;
  }, [sample]);
  const [playing, setPlaying] = useState(false);
  const [ms, setMs] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [theme, setTheme] = useState<(typeof THEMES)[number]>('auto');
  const [ended, setEnded] = useState(false);
  const [android, setAndroid] = useState(false);
  const current = sentenceAt(sentences, ms);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved && (THEMES as string[]).includes(saved)) setTheme(saved as (typeof THEMES)[number]);
    } catch {
      // Storage can be unavailable (private windows); the theme just isn't remembered.
    }
    setAndroid(/Android/i.test(navigator.userAgent));
  }, []);

  const chooseTheme = (t: (typeof THEMES)[number]) => {
    setTheme(t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      // See above.
    }
  };

  // Follow the audio closely while it plays (timeupdate alone only fires about four times a second).
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      if (audio.current) setMs(audio.current.currentTime * 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  // Keep the spoken sentence on screen, without fighting a reader who scrolls back while paused.
  useEffect(() => {
    if (!playing || current < 0) return;
    const el = sentenceEls.current[current];
    if (!el) return;
    const r = el.getBoundingClientRect();
    const bar = 120;
    if (r.top < 72 || r.bottom > window.innerHeight - bar) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    }
  }, [current, playing]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed]);

  const play = useCallback(async () => {
    const a = audio.current;
    if (!a) return;
    a.playbackRate = speed;
    setEnded(false);
    try {
      await a.play();
    } catch {
      setPlaying(false);
    }
  }, [speed]);

  const pause = useCallback(() => audio.current?.pause(), []);

  const seekTo = useCallback(
    (toMs: number, andPlay = true) => {
      const a = audio.current;
      if (!a) return;
      a.currentTime = Math.max(0, toMs) / 1000;
      setMs(Math.max(0, toMs));
      if (andPlay) void play();
    },
    [play],
  );

  const step = useCallback(
    (by: -1 | 1) => {
      const target = sentences[Math.min(sentences.length - 1, Math.max(0, (current < 0 ? 0 : current) + by))];
      if (target) seekTo(target.start, playing);
    },
    [current, playing, seekTo, sentences],
  );

  // Lock screen and headphone controls on phones.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: sample.title,
      artist: sample.author,
      album: 'Lamplight sample',
      artwork: [{ src: '/favicon-192.png', sizes: '192x192', type: 'image/png' }],
    });
    navigator.mediaSession.setActionHandler('play', () => void play());
    navigator.mediaSession.setActionHandler('pause', pause);
    navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
    return () => {
      for (const a of ['play', 'pause', 'previoustrack', 'nexttrack'] as const)
        navigator.mediaSession.setActionHandler(a, null);
    };
  }, [sample, play, pause, step]);

  const left = Math.max(0, (sample.durationMs - ms) / speed);
  const hi = sample.lang === 'hi';
  const openInApp = `intent://open#Intent;scheme=lamplight;package=${PACKAGE};S.browser_fallback_url=${encodeURIComponent(
    'https://keystone-works-three.vercel.app/#get',
  )};end`;

  return (
    <div
      className={`${styles.reader} ${theme === 'auto' ? styles.auto : ''}`}
      style={themeVars(theme)}
      data-reader
    >
      <div className={styles.top}>
        <Link href="/listen" className={styles.back}>
          <span aria-hidden="true">←</span> Samples
        </Link>
        <div className={styles.themes} role="radiogroup" aria-label="Reading theme">
          {THEMES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={theme === t}
              aria-label={THEME_NAMES[t]}
              title={THEME_NAMES[t]}
              className={`${styles.swatch} ${styles[`swatch_${t}`] ?? ''}`}
              onClick={() => chooseTheme(t)}
            />
          ))}
        </div>
      </div>

      <article className={styles.page} lang={sample.lang}>
        <header className={styles.head}>
          <p className={styles.kicker}>
            {LANGUAGE_NAMES[sample.lang]} · {sample.part}
          </p>
          <h1 className={hi ? styles.titleHi : styles.title}>{sample.title}</h1>
          <p className={styles.byline}>
            {sample.author}, {sample.year}
          </p>
        </header>

        <div className={hi ? `${styles.text} ${styles.textHi}` : styles.text}>
          {sample.blocks.map((b, bi) => (
            <p key={bi}>
              {b.sentences.map((s, si) => {
                const i = (firstOf[bi] ?? 0) + si;
                const label = labels.get(i);
                return (
                  <span key={i}>
                    {label && (
                      <span
                        className={styles.speaker}
                        style={{
                          color: label.slot < 0 ? 'var(--label-unknown)' : `var(--label-${label.slot})`,
                        }}
                      >
                        {label.name ?? (hi ? 'कोई' : 'Someone')}
                      </span>
                    )}
                    <span
                      ref={(el) => {
                        sentenceEls.current[i] = el;
                      }}
                      className={i === current ? `${styles.sentence} ${styles.now}` : styles.sentence}
                      onClick={() => seekTo(s.start)}
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

        {(ended || ms > 0) && (
          <aside className={styles.end} aria-live="polite" lang="en">
            <h2>{ended ? 'That’s the sample.' : 'Like what you hear?'}</h2>
            <p>
              In the app, Lamplight reads whole books, and your own EPUBs, PDFs, Word files and saved articles
              too, on your phone, offline. One price, no subscription.
            </p>
            <div className={styles.endActions}>
              <PlayButton id="play-reader" compact />
              {android && (
                <a className={styles.open} href={openInApp}>
                  Open in the app
                </a>
              )}
            </div>
          </aside>
        )}

        <p className={styles.source} lang="en">
          Public domain. {sample.source}
          {sample.corrected && ' One speaker or voice was corrected by hand, as you can in the app.'}
        </p>
      </article>

      <div className={styles.bar} lang="en">
        <div className={styles.barInner}>
          <input
            className={styles.progress}
            type="range"
            min={0}
            max={sample.durationMs}
            step={100}
            value={Math.min(ms, sample.durationMs)}
            onChange={(e) => seekTo(Number(e.target.value), playing)}
            aria-label="Position"
            aria-valuetext={`${clock(ms)} of ${clock(sample.durationMs)}`}
            style={
              { '--done': `${(Math.min(ms, sample.durationMs) / sample.durationMs) * 100}%` } as CSSProperties
            }
          />
          <div className={styles.controls}>
            <button
              type="button"
              className={styles.speed}
              onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1)}
              aria-label={`Speed ${speed}×, change`}
            >
              {speed}×
            </button>
            <button
              type="button"
              className={styles.icon}
              onClick={() => step(-1)}
              aria-label="Previous sentence"
            >
              <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                <path
                  d="M6 5v14M19 5 9 12l10 7V5Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className={styles.main}
              onClick={() => (playing ? pause() : void play())}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? (
                <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
                  <path d="M8 5v14M16 5v14" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
                  <path
                    d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"
                    fill="currentColor"
                  />
                </svg>
              )}
            </button>
            <button type="button" className={styles.icon} onClick={() => step(1)} aria-label="Next sentence">
              <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                <path
                  d="M18 5v14M5 5l10 7-10 7V5Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <span className={styles.left} aria-label={`${clock(left)} left`}>
              −{clock(left)}
            </span>
          </div>
        </div>
      </div>

      <audio
        ref={audio}
        src={sample.audio}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setEnded(true);
        }}
        onTimeUpdate={(e) => !playing && setMs(e.currentTarget.currentTime * 1000)}
      />
    </div>
  );
}
