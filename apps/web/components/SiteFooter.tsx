import Link from 'next/link';
import { Mark } from './Mark';
import styles from './SiteFooter.module.css';

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Mark size={24} />
          <p>
            <strong>Lamplight</strong> reads to you. Offline, private, one price.
          </p>
        </div>
        <nav aria-label="Legal and help" className={styles.links}>
          <Link href="/listen">Listen to samples</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/refunds">Refunds</Link>
          <Link href="/licenses">Licences</Link>
          <Link href="/support">Support</Link>
        </nav>
        <p className={styles.fine}>
          Sample texts are in the public domain. Google Play is a trademark of Google LLC.
        </p>
      </div>
    </footer>
  );
}
