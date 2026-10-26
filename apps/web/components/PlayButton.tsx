import styles from './PlayButton.module.css';

/**
 * "Get it on Google Play", shown as not yet available. It is a plain button rather than Google's badge
 * artwork, which may only be used once the listing is live; swap in the official badge at launch.
 */
export function PlayButton({ id, compact = false }: { id: string; compact?: boolean }) {
  return (
    <div className={compact ? `${styles.wrap} ${styles.compact}` : styles.wrap}>
      <button type="button" className={styles.button} disabled aria-describedby={id}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M6 3.5v17a1 1 0 0 0 1.5.86l14-8.5a1 1 0 0 0 0-1.72l-14-8.5A1 1 0 0 0 6 3.5Z"
          />
        </svg>
        <span className={styles.text}>
          <span className={styles.small}>Get it on</span>
          <span className={styles.big}>Google Play</span>
        </span>
      </button>
      <span id={id} className={styles.soon}>
        Coming soon
      </span>
    </div>
  );
}
