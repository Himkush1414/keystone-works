import type { CSSProperties } from 'react';
import styles from './Interlude.module.css';

/**
 * A line of the page's own story between its acts, set large. Where the browser supports scroll-driven
 * animation, its words light up one by one as it passes through the screen: the page reads itself to you.
 */
export function Interlude({ text, attribution }: { text: string; attribution?: string }) {
  const words = text.split(' ');
  return (
    <figure className={styles.interlude}>
      <blockquote className={styles.quote}>
        {words.map((w, i) => (
          <span key={i} className={styles.word} style={{ '--i': i, '--n': words.length } as CSSProperties}>
            {w}{' '}
          </span>
        ))}
      </blockquote>
      {attribution && <figcaption className={styles.by}>{attribution}</figcaption>}
    </figure>
  );
}
