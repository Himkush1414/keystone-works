import type { EngineErrorEvent } from '../../modules/lamplight-engine/src/types';

/**
 * The listener-facing reason inside a rejected engine call. Native failures carry a code and a message
 * written for the listener; exceptions thrown inside a native function arrive wrapped by Expo
 * ("Call to function … has been rejected. → Caused by: …"), so the innermost cause is kept.
 */
export function failureOf(error: unknown, fallback: string): EngineErrorEvent {
  const e = error as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === 'string' && e.code ? e.code : 'unknown';
  const raw = typeof e?.message === 'string' ? e.message : '';
  const cause = raw.split('→ Caused by:').pop()?.trim() ?? '';
  return { code, message: cause || fallback };
}
