import type { ReactNode } from 'react';
import { Reveal } from './Reveal';
import styles from './Chapter.module.css';

const ROMAN = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
  'XIII',
  'XIV',
  'XV',
  'XVI',
];

/** One feature as a chapter of the page: its number, a title, a few lines, and its working demonstration. */
export function Chapter({
  n,
  id,
  kicker,
  title,
  children,
  demo,
  flip = false,
  wide = false,
}: {
  n: number;
  id: string;
  kicker: string;
  title: ReactNode;
  children: ReactNode;
  demo: ReactNode;
  flip?: boolean;
  /** The demonstration takes the full width under the text. */
  wide?: boolean;
}) {
  return (
    <section
      id={id}
      className={`${styles.band} ${flip ? styles.flip : ''} ${wide ? styles.wide : ''}`}
      aria-labelledby={`${id}-title`}
    >
      <div className={styles.chapter}>
        <Reveal className={styles.copy}>
          <p className={styles.num}>
            <span className={styles.roman}>{ROMAN[n - 1]}</span>
            <span className={styles.kicker}>{kicker}</span>
          </p>
          <h2 id={`${id}-title`} className={styles.title}>
            {title}
          </h2>
          <div className={styles.body}>{children}</div>
        </Reveal>
        <Reveal className={styles.demo}>{demo}</Reveal>
      </div>
    </section>
  );
}
