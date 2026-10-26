'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { play, playing as isPlaying, setRate, setVolume, stop } from '../../lib/clip';
import { clock } from '../../lib/format';
import { sentenceAt, speakerLabels, type TimedSentence } from '../../lib/timeline';
import { ListIcon, MoonIcon, NextIcon, PlayPause, PrevIcon } from './icons';
import d from './demos.module.css';
import s from './PlayerDemo.module.css';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;
/** In the demo a sleep timer of "a few minutes" would never be seen; it runs in seconds instead. */
const SLEEP = [
  { id: 'off', label: 'Off' },
  { id: '20', label: 'In 20 seconds' },
  { id: 'chapter', label: 'At the end of the chapter' },
] as const;
const FADE_MS = 3000;

/**
 * The player: read-along with the voice, sentence by sentence, speed, a sleep timer that fades out, and the
 * book's contents. The book is Pride and Prejudice; the web has its opening, the app all 61 chapters.
 */
export function PlayerDemo({
  title,
  author,
  audio,
  durationMs,
  sentences,
}: {
  title: string;
  author: string;
  audio: string;
  durationMs: number;
  sentences: TimedSentence[];
}) {
  const [ms, setMs] = useState(-1);
  const [on, setOn] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [sheet, setSheet] = useState<'none' | 'sleep' | 'contents'>('none');
  const [sleep, setSleep] = useState<(typeof SLEEP)[number]['id']>('off');
  const [sleepAt, setSleepAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const textRef = useRef<HTMLDivElement>(null);
  const els = useRef<(HTMLSpanElement | null)[]>([]);
  const labels = useMemo(() => speakerLabels(sentences), [sentences]);
  const current = ms < 0 ? -1 : sentenceAt(sentences, ms);

  const listener = useMemo(
    () => ({
      onTime: (t: number) => setMs(t),
      onEnd: () => {
        setOn(false);
        setMs(-1);
        setSleepAt(null);
      },
      onStop: () => setOn(false),
    }),
    [],
  );

  const start = async (from = Math.max(0, ms)) => {
    if (await play(audio, listener, from, speed)) setOn(true);
  };

  // Keep the spoken sentence in view inside the phone, never scrolling the page itself.
  useEffect(() => {
    const box = textRef.current;
    const el = els.current[current];
    if (!box || !el || !on) return;
    const top = el.offsetTop - box.offsetTop;
    if (top < box.scrollTop + 20 || top > box.scrollTop + box.clientHeight - 80)
      box.scrollTo({ top: Math.max(0, top - 60), behavior: 'smooth' });
  }, [current, on]);

  useEffect(() => setRate(speed), [speed]);

  // The sleep timer: count down, then fade out over three seconds and stop.
  useEffect(() => {
    if (sleepAt === null || !on) return;
    const id = setInterval(() => {
      const left = sleepAt - Date.now();
      setNow(Date.now());
      if (left <= FADE_MS) setVolume(left / FADE_MS);
      if (left <= 0) {
        stop(listener);
        setVolume(1);
        setSleepAt(null);
        setSleep('off');
      }
    }, 100);
    return () => clearInterval(id);
  }, [sleepAt, on, listener]);

  const chooseSleep = (id: (typeof SLEEP)[number]['id']) => {
    setSleep(id);
    setSheet('none');
    if (id === 'off') return setSleepAt(null);
    const remaining = id === '20' ? 20_000 : (durationMs - Math.max(0, ms)) / speed;
    setSleepAt(Date.now() + remaining);
    setNow(Date.now());
    if (!on) void start();
  };

  const step = (by: -1 | 1) => {
    const target = sentences[Math.min(sentences.length - 1, Math.max(0, current + by))];
    if (target) void start(target.start);
  };

  const sleepLeft = sleepAt === null ? null : Math.max(0, sleepAt - now);

  return (
    <div className={d.phone}>
      <div className={d.screen}>
        <div className={d.bar}>
          <span>
            {title} <span className={d.faint}>· Chapter 1</span>
          </span>
          <span className="visually-hidden">by {author}</span>
        </div>
        <div ref={textRef} className={`${d.reading} ${s.text}`}>
          {[...new Set(sentences.map((x) => x.block))].map((block) => (
            <p key={block}>
              {sentences
                .filter((x) => x.block === block)
                .map((x) => {
                  const label = labels.get(x.index);
                  return (
                    <span key={x.index}>
                      {label && (
                        <span
                          className={d.label}
                          style={{
                            color: label.slot < 0 ? 'var(--label-unknown)' : `var(--label-${label.slot % 4})`,
                          }}
                        >
                          {label.name ?? 'Someone'}
                        </span>
                      )}
                      <span
                        ref={(el) => {
                          els.current[x.index] = el;
                        }}
                        className={x.index === current ? `${d.sentence} ${d.now}` : d.sentence}
                        onClick={() => void start(x.start)}
                      >
                        {x.text}
                      </span>
                      {x.gap}
                    </span>
                  );
                })}
            </p>
          ))}
        </div>
        <div className={s.controls}>
          <div className={d.meter} aria-hidden="true">
            <span style={{ transform: `scaleX(${Math.max(0, ms) / durationMs})` }} />
          </div>
          <div className={s.meta}>
            <span className={d.faint}>
              {sleepLeft !== null
                ? `Sleep in ${clock(sleepLeft)}`
                : `${clock(Math.max(0, durationMs - Math.max(0, ms)) / speed)} left in chapter`}
            </span>
          </div>
          <div className={s.buttons}>
            <button
              type="button"
              className={`${d.ghost} ${s.speed}`}
              onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1)}
              aria-label={`Speed ${speed}×, change`}
            >
              {speed}×
            </button>
            <button type="button" className={d.ghost} onClick={() => step(-1)} aria-label="Previous sentence">
              <PrevIcon />
            </button>
            <PlayPause
              className={d.round}
              size={60}
              playing={on && isPlaying(listener)}
              label="Pride and Prejudice"
              onClick={() => (on ? stop(listener) : void start())}
            />
            <button type="button" className={d.ghost} onClick={() => step(1)} aria-label="Next sentence">
              <NextIcon />
            </button>
            <button
              type="button"
              className={d.ghost}
              onClick={() => setSheet(sheet === 'sleep' ? 'none' : 'sleep')}
              aria-label="Sleep timer"
              aria-expanded={sheet === 'sleep'}
              style={sleep !== 'off' ? { color: 'var(--color-accent)' } : undefined}
            >
              <MoonIcon />
            </button>
          </div>
          <button type="button" className={`${d.chip} ${s.contents}`} onClick={() => setSheet('contents')}>
            <ListIcon /> Contents
          </button>
        </div>

        <div className={d.sheet} data-open={sheet === 'sleep'} aria-hidden={sheet !== 'sleep'}>
          <div className={d.grip} />
          <p className={s.sheetTitle}>Sleep timer</p>
          <div role="radiogroup" aria-label="Sleep timer">
            {SLEEP.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={sleep === o.id}
                className={d.option}
                tabIndex={sheet === 'sleep' ? 0 : -1}
                onClick={() => chooseSleep(o.id)}
              >
                <span
                  className={d.dot}
                  style={{ background: sleep === o.id ? 'var(--color-accent)' : 'var(--color-hairline)' }}
                />
                {o.label}
              </button>
            ))}
          </div>
          <p className={`${d.small} ${d.faint}`}>
            In the app: 5, 10, 15, 30, 45 or 60 minutes, or the end of the chapter, with a gentle fade.
          </p>
        </div>

        <div className={d.sheet} data-open={sheet === 'contents'} aria-hidden={sheet !== 'contents'}>
          <div className={d.grip} />
          <div className={s.sheetHead}>
            <p className={s.sheetTitle}>Contents</p>
            <button
              type="button"
              className={d.ghost}
              onClick={() => setSheet('none')}
              tabIndex={sheet === 'contents' ? 0 : -1}
              aria-label="Close contents"
            >
              ✕
            </button>
          </div>
          <ol className={`${d.list} ${s.chapters}`}>
            {Array.from({ length: 61 }, (_, i) => (
              <li key={i} className={i === 0 ? s.chapterOn : s.chapterOff}>
                <span>Chapter {i + 1}</span>
                <span className={d.faint}>{i === 0 ? 'Playing' : 'In the app'}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
