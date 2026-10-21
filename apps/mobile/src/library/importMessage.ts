import type { Params, TKey } from '../i18n/translate';
import type { ImportSummary } from '../state/library';
import type { ToastSpec } from '../state/toast';

const ERROR_KEYS: Record<string, TKey> = {
  drm: 'errors.drm',
  scanned: 'errors.scanned',
  password: 'errors.password',
  corrupt: 'errors.corrupt',
  empty: 'errors.empty',
  unsupported: 'errors.unsupported',
  tooLarge: 'errors.tooLarge',
  network: 'errors.network',
  partialArticle: 'errors.partialArticle',
};

/**
 * What to tell the listener after an import: how many items were added, the reason the first file failed,
 * or that it was already there (with a way to open it). Null when nothing happened.
 */
export function importMessage(
  summary: ImportSummary,
  t: (key: TKey, params?: Params) => string,
  open: (id: string) => void,
): ToastSpec | null {
  const failed = summary.failed[0];
  const reason = failed ? t(ERROR_KEYS[failed.code] ?? 'errors.generic') : null;
  if (summary.added.length > 0) {
    const added = t('import.added', { n: summary.added.length });
    return reason ? { message: `${added}. ${reason}`, tone: 'danger' } : { message: added };
  }
  if (reason) return { message: reason, tone: 'danger' };
  const existing = summary.duplicates[0];
  if (existing) {
    return {
      message: t('import.duplicate'),
      action: { label: t('import.openExisting'), run: () => open(existing) },
    };
  }
  return null;
}
