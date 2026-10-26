import type { Metadata } from 'next';
import Link from 'next/link';
import { coverPalettes } from '@lamplight/tokens';
import { clock, LANGUAGE_NAMES, SAMPLES } from '../../lib/samples';
import styles from './listen.module.css';

export const metadata: Metadata = {
  title: 'Listen to samples',
  description:
    'Hear Lamplight read Jane Austen, Lewis Carroll and Premchand in English and Hindi, with each speaker in their own voice. Rendered on the same on-device voices as the app.',
};

export default function Listen() {
  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <p className={styles.kicker}>Samples</p>
        <h1>Press play. Follow along.</h1>
        <p className={styles.lede}>
          Four short public-domain excerpts, in English and Hindi, read by the voices that live inside the
          app. Each sentence lights up as it’s spoken, and Cast gives every character a voice of their own.
        </p>
      </header>

      <ul className={styles.grid}>
        {SAMPLES.map((s, i) => {
          const [bg, ink, rule] = coverPalettes[(i * 3 + 1) % coverPalettes.length] ?? [
            '#2F3A33',
            '#EFE6D2',
            '#C9A35B',
          ];
          const voices = new Set(s.blocks.flatMap((b) => b.sentences.map((x) => x.voice))).size;
          return (
            <li key={s.id}>
              <Link href={`/listen/${s.id}`} className={styles.card}>
                <span
                  className={styles.cover}
                  style={{ background: bg, color: ink }}
                  lang={s.lang}
                  aria-hidden="true"
                >
                  <span className={styles.coverRule} style={{ background: rule }} />
                  <span className={s.lang === 'hi' ? styles.coverTitleHi : styles.coverTitle}>{s.title}</span>
                  <span className={styles.coverAuthor}>{s.author}</span>
                </span>
                <span className={styles.meta}>
                  <span className={styles.lang}>{LANGUAGE_NAMES[s.lang]}</span>
                  <span className={styles.title} lang={s.lang}>
                    {s.title}
                  </span>
                  <span className={styles.sub} lang={s.lang}>
                    {s.author} · {s.part}
                  </span>
                  <span className={styles.facts}>
                    {clock(s.durationMs)} · {voices} voices
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <section className={styles.note}>
        <h2>Why only samples?</h2>
        <p>
          The website plays short excerpts we prepared ahead. The app is where Lamplight really works: it
          reads whole books and your own EPUBs, PDFs, Word files and articles, right on your phone, without
          the internet.
        </p>
      </section>
    </div>
  );
}
