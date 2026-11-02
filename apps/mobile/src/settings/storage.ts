import { formatNumber, type Locale } from '../i18n/translate';

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** "0 MB", "12 MB", "1,4 GB": whole megabytes below a gigabyte, one decimal above. */
export function formatBytes(locale: Locale, bytes: number): string {
  const b = Math.max(0, bytes);
  if (b >= GB) return `${formatNumber(locale, Math.round((b / GB) * 10) / 10, 1)} GB`;
  return `${formatNumber(locale, Math.round(b / MB), 0)} MB`;
}
