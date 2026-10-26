import type { ReactNode } from 'react';
import styles from './Prose.module.css';

/** A legal or help page: a title, when it last changed, and readable body text. */
export function Prose({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <article className={styles.prose}>
      <h1>{title}</h1>
      {updated && <p className={styles.updated}>Last updated {updated}</p>}
      {children}
    </article>
  );
}
