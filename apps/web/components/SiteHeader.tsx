import Link from 'next/link';
import { Mark } from './Mark';
import styles from './SiteHeader.module.css';

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label="Lamplight home">
          <Mark size={28} />
          <span className={styles.word}>Lamplight</span>
        </Link>
        <nav aria-label="Main" className={styles.nav}>
          <Link href="/listen">Listen</Link>
          <Link href="/#promise" className={styles.wide}>
            Promise
          </Link>
          <Link href="/#faq" className={styles.wide}>
            FAQ
          </Link>
        </nav>
      </div>
    </header>
  );
}
